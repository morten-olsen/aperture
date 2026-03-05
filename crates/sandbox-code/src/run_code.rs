use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use async_trait::async_trait;
use serde_json::Value;
use tokio::sync::mpsc;

use aperture_engine::error::{EngineError, Result};
use aperture_engine::redaction::RedactionRegistry;
use aperture_engine::sandbox::{
    PendingApproval, ReplayEntry, SandboxRequest, ScriptResolver, ToolDescriptor,
};
use aperture_engine::tool::{ApprovalContext, Tool, ToolContext, ToolInvoke};

use crate::quickjs::CodeSandbox;

/// Check whether an inner tool requires approval, returning `Some(reason)` if so.
fn check_inner_approval(
    tool: &Tool,
    input: &Value,
    extensions: &aperture_engine::Extensions,
    user_id: &str,
) -> Option<String> {
    match &tool.require_approval {
        None => None,
        Some(aperture_engine::tool::ApprovalRequirement::Always { reason }) => Some(reason.clone()),
        Some(aperture_engine::tool::ApprovalRequirement::Dynamic(f)) => {
            let ctx = ApprovalContext {
                extensions,
                user_id,
            };
            f(input, &ctx)
        }
    }
}

/// Shared host-loop logic for executing code in the sandbox.
///
/// When `skip_approval` is true, inner tool approval checks are bypassed
/// (used for pre-approved scripts).
pub(crate) async fn run_in_sandbox(
    code: &str,
    sandbox: &Arc<dyn CodeSandbox>,
    tools: &[Tool],
    ctx: &mut ToolContext<'_>,
    skip_approval: bool,
) -> Result<Value> {
    // Clear any previously tracked redaction values for this execution.
    if let Some(registry) = ctx.extensions.get::<RedactionRegistry>() {
        registry.clear();
    }

    let descriptors: Vec<ToolDescriptor> = tools.iter().map(Into::into).collect();

    // Extract replay log if this is a resumed invocation.
    let replay_log = ctx.replay.take().unwrap_or_default();
    let mut replay_iter = replay_log.into_iter().peekable();

    let interrupt = Arc::new(AtomicBool::new(false));

    // Channel for the sandbox to request tool invocations.
    let (call_tx, mut call_rx) = mpsc::channel::<SandboxRequest>(32);

    // Spawn the sandbox execution.
    let sandbox = sandbox.clone();
    let code_owned = code.to_string();
    let interrupt_clone = interrupt.clone();
    let handle = tokio::spawn(async move {
        sandbox
            .execute(&code_owned, &descriptors, call_tx, interrupt_clone)
            .await
    });

    // State for the host loop.
    let mut recording: Vec<ReplayEntry> = Vec::new();
    let mut pending_approval: Option<PendingApproval> = None;
    let mut replay_mismatch: Option<String> = None;

    // Host loop: service requests until the sandbox finishes.
    while let Some(req) = call_rx.recv().await {
        match req {
            SandboxRequest::DateNow { response } => {
                if let Some(entry) = replay_iter.peek() {
                    if let ReplayEntry::DateNow { value } = entry {
                        let v = *value;
                        replay_iter.next();
                        recording.push(ReplayEntry::DateNow { value: v });
                        let _ = response.send(v);
                        continue;
                    }
                    // Type mismatch during replay.
                    let msg = format!(
                        "Script replay failed: expected {:?} but got DateNow. \
                         The script is not deterministic and cannot be resumed.",
                        entry
                    );
                    replay_mismatch = Some(msg);
                    interrupt.store(true, Ordering::Release);
                    let _ = response.send(0.0);
                    continue;
                }
                // Live mode.
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as f64)
                    .unwrap_or(0.0);
                recording.push(ReplayEntry::DateNow { value: now });
                let _ = response.send(now);
            }
            SandboxRequest::MathRandom { response } => {
                if let Some(entry) = replay_iter.peek() {
                    if let ReplayEntry::MathRandom { value } = entry {
                        let v = *value;
                        replay_iter.next();
                        recording.push(ReplayEntry::MathRandom { value: v });
                        let _ = response.send(v);
                        continue;
                    }
                    let msg = format!(
                        "Script replay failed: expected {:?} but got MathRandom. \
                         The script is not deterministic and cannot be resumed.",
                        entry
                    );
                    replay_mismatch = Some(msg);
                    interrupt.store(true, Ordering::Release);
                    let _ = response.send(0.0);
                    continue;
                }
                // Live mode.
                let v = rand::random::<f64>();
                recording.push(ReplayEntry::MathRandom { value: v });
                let _ = response.send(v);
            }
            SandboxRequest::ToolCall {
                tool_id,
                input,
                response,
            } => {
                // --- Replay mode ---
                if let Some(entry) = replay_iter.peek() {
                    match entry {
                        ReplayEntry::ToolCall {
                            tool_id: rec_id,
                            input: rec_input,
                            output,
                        } => {
                            if *rec_id == tool_id && *rec_input == input {
                                let out = output.clone();
                                let rec_entry = entry.clone();
                                replay_iter.next();
                                recording.push(rec_entry);
                                let _ = response.send(Ok(out));
                                continue;
                            }
                            let msg = format!(
                                "Script replay failed: expected call to {rec_id}({rec_input}) \
                                 but got {tool_id}({input}). The script is not deterministic \
                                 and cannot be resumed."
                            );
                            replay_mismatch = Some(msg);
                            interrupt.store(true, Ordering::Release);
                            let _ = response
                                .send(Err(EngineError::ToolInvocation("replay mismatch".into())));
                            continue;
                        }
                        ReplayEntry::ToolCallError {
                            tool_id: rec_id,
                            input: rec_input,
                            error,
                        } => {
                            if *rec_id == tool_id && *rec_input == input {
                                let err = error.clone();
                                let rec_entry = entry.clone();
                                replay_iter.next();
                                recording.push(rec_entry);
                                let _ = response.send(Err(EngineError::ToolInvocation(err)));
                                continue;
                            }
                            let msg = format!(
                                "Script replay failed: expected call to {rec_id}({rec_input}) \
                                 but got {tool_id}({input}). The script is not deterministic \
                                 and cannot be resumed."
                            );
                            replay_mismatch = Some(msg);
                            interrupt.store(true, Ordering::Release);
                            let _ = response
                                .send(Err(EngineError::ToolInvocation("replay mismatch".into())));
                            continue;
                        }
                        _ => {
                            // Expected non-tool-call entry but got a tool call.
                            let msg = format!(
                                "Script replay failed: expected {:?} but got ToolCall \
                                 {tool_id}({input}). The script is not deterministic \
                                 and cannot be resumed.",
                                entry
                            );
                            replay_mismatch = Some(msg);
                            interrupt.store(true, Ordering::Release);
                            let _ = response
                                .send(Err(EngineError::ToolInvocation("replay mismatch".into())));
                            continue;
                        }
                    }
                }

                // --- Live mode ---
                let tool = tools.iter().find(|t| t.id == tool_id);

                let tool = match tool {
                    Some(t) => t,
                    None => {
                        let err_msg = format!("tool not found: {tool_id}");
                        recording.push(ReplayEntry::ToolCallError {
                            tool_id: tool_id.clone(),
                            input: input.clone(),
                            error: err_msg.clone(),
                        });
                        let _ = response.send(Err(EngineError::ToolNotFound(tool_id)));
                        continue;
                    }
                };

                // Check approval requirement on inner tool (unless bypassed).
                if !skip_approval {
                    if let Some(reason) =
                        check_inner_approval(tool, &input, ctx.extensions, &ctx.user_id)
                    {
                        pending_approval = Some(PendingApproval {
                            code: code.to_string(),
                            replay_log: recording.clone(),
                            tool_id: tool_id.clone(),
                            tool_input: input.clone(),
                            approval_reason: reason,
                        });
                        interrupt.store(true, Ordering::Release);
                        let _ = response
                            .send(Err(EngineError::ToolInvocation("approval required".into())));
                        continue;
                    }
                }

                let tool_ctx = ToolContext {
                    input: input.clone(),
                    state: &mut *ctx.state,
                    extensions: ctx.extensions,
                    events: ctx.events,
                    user_id: ctx.user_id.clone(),
                    replay: None,
                };

                let result = tool.invoke.invoke(tool_ctx).await;

                match &result {
                    Ok(output) => {
                        recording.push(ReplayEntry::ToolCall {
                            tool_id: tool_id.clone(),
                            input: input.clone(),
                            output: output.clone(),
                        });
                    }
                    Err(e) => {
                        recording.push(ReplayEntry::ToolCallError {
                            tool_id: tool_id.clone(),
                            input: input.clone(),
                            error: e.to_string(),
                        });
                    }
                }

                let _ = response.send(result);
            }
        }
    }

    // Collect the sandbox result.
    let sandbox_result = handle
        .await
        .map_err(|e| EngineError::ToolInvocation(format!("sandbox task failed: {e}")))?;

    // Check if we paused for approval.
    if let Some(approval) = pending_approval {
        let reason = approval.approval_reason.clone();
        return Err(EngineError::ApprovalRequired {
            reason,
            approval: Box::new(approval),
        });
    }

    // Check for replay mismatch.
    if let Some(msg) = replay_mismatch {
        return Err(EngineError::ToolInvocation(msg));
    }

    match sandbox_result {
        Ok(mut result) => {
            if let Some(registry) = ctx.extensions.get::<RedactionRegistry>() {
                registry.redact_result(&mut result);
            }
            serde_json::to_value(&result).map_err(EngineError::from)
        }
        Err(e) => {
            // Try to parse structured error JSON (with console_output).
            if let Ok(parsed) = serde_json::from_str::<Value>(&e.to_string()) {
                if parsed.get("error").is_some() {
                    return Ok(parsed);
                }
            }
            Err(e)
        }
    }
}

// ── RunCodeInvoke ──────────────────────────────────────────────────

pub struct RunCodeInvoke {
    pub sandbox: Arc<dyn CodeSandbox>,
    pub tools: Arc<Vec<Tool>>,
}

#[async_trait]
impl ToolInvoke for RunCodeInvoke {
    async fn invoke(&self, mut ctx: ToolContext<'_>) -> Result<Value> {
        let code = ctx
            .input
            .get("code")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: code".into()))?
            .to_string();

        run_in_sandbox(&code, &self.sandbox, &self.tools, &mut ctx, false).await
    }
}

// ── RunScriptInvoke ────────────────────────────────────────────────

pub struct RunScriptInvoke {
    pub sandbox: Arc<dyn CodeSandbox>,
    pub tools: Arc<Vec<Tool>>,
}

#[async_trait]
impl ToolInvoke for RunScriptInvoke {
    async fn invoke(&self, mut ctx: ToolContext<'_>) -> Result<Value> {
        let path = ctx
            .input
            .get("path")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: path".into()))?
            .to_string();

        let resolver = ctx
            .extensions
            .get::<Box<dyn ScriptResolver>>()
            .ok_or_else(|| {
                EngineError::ToolInvocation(
                    "ScriptResolver not found in extensions — is ScriptPlugin registered?".into(),
                )
            })?;

        let content = resolver
            .read_script(&ctx.user_id, &path)
            .map_err(EngineError::ToolInvocation)?;

        let skip_approval = resolver.is_approved(&ctx.user_id, &path, &content);

        run_in_sandbox(
            &content,
            &self.sandbox,
            &self.tools,
            &mut ctx,
            skip_approval,
        )
        .await
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::sandbox::ReplayEntry;
    use aperture_engine::state::State;
    use aperture_engine::tool::ApprovalRequirement;
    use serde_json::json;

    use crate::quickjs::QuickJsSandbox;

    struct EchoInvoke;

    #[async_trait]
    impl ToolInvoke for EchoInvoke {
        async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
            Ok(ctx.input.clone())
        }
    }

    fn make_echo_tool() -> Tool {
        Tool {
            id: "echo".into(),
            description: "Echo".into(),
            input_schema: json!({"type": "object", "properties": {"msg": {"type": "string"}}}),
            output_schema: None,
            require_approval: None,
            invoke: Box::new(EchoInvoke),
        }
    }

    fn make_approval_tool() -> Tool {
        Tool {
            id: "dangerous".into(),
            description: "Dangerous".into(),
            input_schema: json!({"type": "object", "properties": {"cmd": {"type": "string"}}}),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "dangerous operation".into(),
            }),
            invoke: Box::new(EchoInvoke),
        }
    }

    fn make_run_code(tools: Vec<Tool>) -> RunCodeInvoke {
        RunCodeInvoke {
            sandbox: Arc::new(QuickJsSandbox::new()),
            tools: Arc::new(tools),
        }
    }

    fn make_ctx<'a>(
        code: &str,
        state: &'a mut State,
        ext: &'a Extensions,
        events: &'a EventBus,
        replay: Option<Vec<ReplayEntry>>,
    ) -> ToolContext<'a> {
        ToolContext {
            input: json!({"code": code}),
            state,
            extensions: ext,
            events,
            user_id: "test-user".into(),
            replay,
        }
    }

    #[tokio::test]
    async fn live_mode_records_entries() {
        let run_code = make_run_code(vec![make_echo_tool()]);
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();
        let ctx = make_ctx(r#"echo({msg: "hello"})"#, &mut state, &ext, &events, None);

        let result = run_code.invoke(ctx).await.unwrap();
        assert!(result["value"]["msg"].as_str().is_some());
    }

    #[tokio::test]
    async fn replay_matching_entries_returns_recorded_outputs() {
        let run_code = make_run_code(vec![make_echo_tool()]);
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();

        let replay = vec![ReplayEntry::ToolCall {
            tool_id: "echo".into(),
            input: json!({"msg": "hello"}),
            output: json!({"msg": "hello", "replayed": true}),
        }];

        let ctx = make_ctx(
            r#"echo({msg: "hello"})"#,
            &mut state,
            &ext,
            &events,
            Some(replay),
        );

        let result = run_code.invoke(ctx).await.unwrap();
        // The replayed output should include the extra "replayed" field
        // since the host loop returns the recorded output without invoking the tool.
        assert_eq!(result["value"]["replayed"], true);
    }

    #[tokio::test]
    async fn replay_mismatch_tool_id_returns_error() {
        let run_code = make_run_code(vec![make_echo_tool()]);
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();

        let replay = vec![ReplayEntry::ToolCall {
            tool_id: "other_tool".into(),
            input: json!({"msg": "hello"}),
            output: json!("ok"),
        }];

        let ctx = make_ctx(
            r#"echo({msg: "hello"})"#,
            &mut state,
            &ext,
            &events,
            Some(replay),
        );

        let err = run_code.invoke(ctx).await.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("replay failed") || msg.contains("not deterministic"),
            "expected replay mismatch error in: {msg}"
        );
    }

    #[tokio::test]
    async fn replay_mismatch_input_returns_error() {
        let run_code = make_run_code(vec![make_echo_tool()]);
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();

        let replay = vec![ReplayEntry::ToolCall {
            tool_id: "echo".into(),
            input: json!({"msg": "different"}),
            output: json!("ok"),
        }];

        let ctx = make_ctx(
            r#"echo({msg: "hello"})"#,
            &mut state,
            &ext,
            &events,
            Some(replay),
        );

        let err = run_code.invoke(ctx).await.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("replay failed") || msg.contains("not deterministic"),
            "expected replay mismatch error in: {msg}"
        );
    }

    #[tokio::test]
    async fn replay_exhaustion_transitions_to_live_mode() {
        let run_code = make_run_code(vec![make_echo_tool()]);
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();

        // Replay has one entry, but the script makes two calls.
        let replay = vec![ReplayEntry::ToolCall {
            tool_id: "echo".into(),
            input: json!({"msg": "first"}),
            output: json!({"msg": "first", "replayed": true}),
        }];

        let ctx = make_ctx(
            r#"
            var a = echo({msg: "first"});
            var b = echo({msg: "second"});
            ({a: a, b: b})
            "#,
            &mut state,
            &ext,
            &events,
            Some(replay),
        );

        let result = run_code.invoke(ctx).await.unwrap();
        // First call replayed, second live.
        assert_eq!(result["value"]["a"]["replayed"], true);
        assert_eq!(result["value"]["b"]["msg"], "second");
        // Live call shouldn't have the replayed field.
        assert!(result["value"]["b"].get("replayed").is_none());
    }

    #[tokio::test]
    async fn approval_halt_returns_approval_required() {
        let run_code = make_run_code(vec![make_echo_tool(), make_approval_tool()]);
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();

        let ctx = make_ctx(
            r#"
            var a = echo({msg: "safe"});
            dangerous({cmd: "rm -rf /"});
            "#,
            &mut state,
            &ext,
            &events,
            None,
        );

        let err = run_code.invoke(ctx).await.unwrap_err();
        match err {
            EngineError::ApprovalRequired { reason, approval } => {
                assert_eq!(reason, "dangerous operation");
                assert_eq!(approval.tool_id, "dangerous");
                assert_eq!(approval.tool_input, json!({"cmd": "rm -rf /"}));
                // Code should match the original input verbatim.
                assert!(approval.code.contains("echo({msg: \"safe\"})"));
                assert!(approval.code.contains("dangerous({cmd: \"rm -rf /\"})"));
                // Replay log should contain the successful echo call.
                assert_eq!(approval.replay_log.len(), 1);
                match &approval.replay_log[0] {
                    ReplayEntry::ToolCall { tool_id, .. } => {
                        assert_eq!(tool_id, "echo");
                    }
                    other => panic!("expected ToolCall entry, got {other:?}"),
                }
            }
            other => panic!("expected ApprovalRequired, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn skip_approval_bypasses_approval_check() {
        let tools = vec![make_echo_tool(), make_approval_tool()];
        let sandbox: Arc<dyn CodeSandbox> = Arc::new(QuickJsSandbox::new());
        let mut state = State::new();
        let ext = Extensions::new();
        let events = EventBus::new();

        let code = r#"dangerous({cmd: "deploy"})"#;
        let mut ctx = ToolContext {
            input: json!({"code": code}),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "test-user".into(),
            replay: None,
        };

        // With skip_approval=true, the dangerous tool should execute without halting.
        let result = run_in_sandbox(code, &sandbox, &tools, &mut ctx, true)
            .await
            .unwrap();
        assert_eq!(result["value"]["cmd"], "deploy");
    }

    #[tokio::test]
    async fn run_script_resolves_and_executes() {
        struct TestResolver;
        impl ScriptResolver for TestResolver {
            fn read_script(
                &self,
                _user_id: &str,
                path: &str,
            ) -> std::result::Result<String, String> {
                if path == "test.js" {
                    Ok(r#"echo({msg: "from script"})"#.to_string())
                } else {
                    Err(format!("not found: {path}"))
                }
            }
            fn is_approved(&self, _user_id: &str, _path: &str, _content: &str) -> bool {
                false
            }
        }

        let tools = Arc::new(vec![make_echo_tool()]);
        let sandbox: Arc<dyn CodeSandbox> = Arc::new(QuickJsSandbox::new());
        let invoke = RunScriptInvoke { sandbox, tools };

        let mut state = State::new();
        let mut ext = Extensions::new();
        ext.insert(Box::new(TestResolver) as Box<dyn ScriptResolver>);
        let events = EventBus::new();

        let ctx = ToolContext {
            input: json!({"path": "test.js"}),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "test-user".into(),
            replay: None,
        };

        let result = invoke.invoke(ctx).await.unwrap();
        assert_eq!(result["value"]["msg"], "from script");
    }

    #[tokio::test]
    async fn run_script_approved_skips_approval() {
        struct ApprovedResolver;
        impl ScriptResolver for ApprovedResolver {
            fn read_script(
                &self,
                _user_id: &str,
                _path: &str,
            ) -> std::result::Result<String, String> {
                Ok(r#"dangerous({cmd: "deploy"})"#.to_string())
            }
            fn is_approved(&self, _user_id: &str, _path: &str, _content: &str) -> bool {
                true
            }
        }

        let tools = Arc::new(vec![make_echo_tool(), make_approval_tool()]);
        let sandbox: Arc<dyn CodeSandbox> = Arc::new(QuickJsSandbox::new());
        let invoke = RunScriptInvoke { sandbox, tools };

        let mut state = State::new();
        let mut ext = Extensions::new();
        ext.insert(Box::new(ApprovedResolver) as Box<dyn ScriptResolver>);
        let events = EventBus::new();

        let ctx = ToolContext {
            input: json!({"path": "approved.js"}),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "test-user".into(),
            replay: None,
        };

        // Should succeed because the resolver says it's approved.
        let result = invoke.invoke(ctx).await.unwrap();
        assert_eq!(result["value"]["cmd"], "deploy");
    }

    #[tokio::test]
    async fn run_script_unapproved_halts_on_approval() {
        struct UnapprovedResolver;
        impl ScriptResolver for UnapprovedResolver {
            fn read_script(
                &self,
                _user_id: &str,
                _path: &str,
            ) -> std::result::Result<String, String> {
                Ok(r#"dangerous({cmd: "deploy"})"#.to_string())
            }
            fn is_approved(&self, _user_id: &str, _path: &str, _content: &str) -> bool {
                false
            }
        }

        let tools = Arc::new(vec![make_echo_tool(), make_approval_tool()]);
        let sandbox: Arc<dyn CodeSandbox> = Arc::new(QuickJsSandbox::new());
        let invoke = RunScriptInvoke { sandbox, tools };

        let mut state = State::new();
        let mut ext = Extensions::new();
        ext.insert(Box::new(UnapprovedResolver) as Box<dyn ScriptResolver>);
        let events = EventBus::new();

        let ctx = ToolContext {
            input: json!({"path": "unapproved.js"}),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "test-user".into(),
            replay: None,
        };

        // Should halt because the script is not approved.
        let err = invoke.invoke(ctx).await.unwrap_err();
        assert!(matches!(err, EngineError::ApprovalRequired { .. }));
    }
}
