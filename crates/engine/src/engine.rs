use async_trait::async_trait;
use serde_json::Value;
use uuid::Uuid;

use crate::action::{Action, ActionContext};
use crate::context::ContextItem;
use crate::error::{EngineError, Result};
use crate::event::EventBus;
use crate::extensions::Extensions;
use crate::plugin::{Plugin, PrepareContext, SetupContext};
use crate::prompt::{Prompt, PromptOutput, PromptState, ToolResult};
use crate::prompt_events::{
    PROMPT_COMPLETED, PROMPT_CREATED, PROMPT_UPDATED, PROMPT_WAITING_FOR_APPROVAL,
};
use crate::state::State;
use crate::tool::{Tool, ToolContext};

// ── LLM abstraction ──────────────────────────────────────────────────

/// A message in the format expected by the LLM.
#[derive(Debug, Clone)]
pub enum LlmMessage {
    System(String),
    User(String),
    Assistant(String),
    ToolCall {
        tool_id: String,
        input: Value,
    },
    ToolResponse {
        tool_id: String,
        output: Value,
    },
}

/// The response the LLM produces for a single turn.
#[derive(Debug, Clone)]
pub struct LlmResponse {
    /// The outputs the model wants to produce (text, tool calls, etc.).
    pub outputs: Vec<PromptOutput>,
    /// Token usage for this turn.
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
}

/// Trait abstracting the model call, making the engine testable without a real LLM.
#[async_trait]
pub trait LlmClient: Send + Sync {
    async fn call(&self, messages: &[LlmMessage], tools: &[&Tool]) -> Result<LlmResponse>;
}

// ── Engine ───────────────────────────────────────────────────────────

pub struct Engine {
    plugins: Vec<Box<dyn Plugin>>,
    extensions: Extensions,
    events: EventBus,
    actions: Vec<Action>,
}

impl Engine {
    pub fn new() -> Self {
        Self {
            plugins: Vec::new(),
            extensions: Extensions::new(),
            events: EventBus::new(),
            actions: Vec::new(),
        }
    }

    /// Register a plugin. Calls `setup` immediately.
    pub async fn register(&mut self, plugin: Box<dyn Plugin>) -> Result<()> {
        {
            let mut ctx = SetupContext {
                extensions: &mut self.extensions,
                events: &self.events,
                actions: &mut self.actions,
            };
            plugin
                .setup(&mut ctx)
                .await
                .map_err(|e| EngineError::PluginSetup(format!("{}: {e}", plugin.id())))?;
        }
        self.plugins.push(plugin);
        Ok(())
    }

    /// Run the prepare phase on all registered plugins, collecting tools and context.
    pub async fn prepare_all(
        &self,
        state: &mut State,
        history: &[PromptOutput],
    ) -> Result<(Vec<Tool>, Vec<ContextItem>)> {
        let mut tools = Vec::new();
        let mut context = Vec::new();

        for plugin in &self.plugins {
            let mut ctx = PrepareContext {
                tools: &mut tools,
                context: &mut context,
                state,
                extensions: &self.extensions,
                events: &self.events,
                history,
            };
            plugin
                .prepare(&mut ctx)
                .await
                .map_err(|e| EngineError::PluginPrepare(format!("{}: {e}", plugin.id())))?;
        }

        Ok((tools, context))
    }

    /// Get a reference to all registered actions.
    pub fn actions(&self) -> &[Action] {
        &self.actions
    }

    /// Invoke an action by ID.
    pub async fn invoke_action(
        &self,
        action_id: &str,
        user_id: &str,
        input: Value,
    ) -> Result<Value> {
        let action = self
            .actions
            .iter()
            .find(|a| a.id == action_id)
            .ok_or_else(|| EngineError::ActionNotFound(action_id.to_string()))?;

        let ctx = ActionContext {
            user_id: user_id.to_string(),
            input,
            extensions: &self.extensions,
            events: &self.events,
        };

        action.invoke.invoke(ctx).await
    }

    /// Insert an extension after plugin registration (e.g. for PromptRunner).
    pub fn insert_extension<T: Send + Sync + 'static>(&mut self, value: T) {
        self.extensions.insert(value);
    }

    /// Get a reference to the event bus.
    pub fn events(&self) -> &EventBus {
        &self.events
    }

    /// Run the agent loop for a single user prompt.
    ///
    /// The loop: prepare plugins → project messages → call LLM → process outputs.
    /// Repeats until the model produces no tool calls (i.e. a final text response).
    pub async fn run(
        &self,
        llm: &dyn LlmClient,
        user_id: &str,
        input: &str,
        history: &[Prompt],
    ) -> Result<Prompt> {
        let mut state = State::new();
        let prompt = Prompt::new(
            Uuid::new_v4().to_string(),
            user_id.to_string(),
            Some(input.to_string()),
        );

        self.events.publish(&PROMPT_CREATED, &prompt).await;

        self.run_loop(llm, &mut state, prompt, history).await
    }

    /// Resume a prompt after approval was granted for a sandbox tool.
    ///
    /// Finds the pending `ToolResult` with approval data, re-invokes `run_code`
    /// with the replay log, and continues the agent loop.
    pub async fn approve(
        &self,
        llm: &dyn LlmClient,
        mut prompt: Prompt,
    ) -> Result<Prompt> {
        let mut state = State::new();

        // Find the pending tool result with approval data.
        let pending_idx = prompt.output.iter().position(|o| {
            matches!(
                o,
                PromptOutput::Tool {
                    result: Some(ToolResult::Pending {
                        approval: Some(_),
                        ..
                    }),
                    ..
                }
            )
        });

        let pending_idx = pending_idx
            .ok_or_else(|| EngineError::ToolInvocation("no pending approval found".into()))?;

        // Extract the pending approval data.
        let (tool_id_outer, tool_input_outer, approval_data) =
            match &prompt.output[pending_idx] {
                PromptOutput::Tool {
                    tool_id,
                    input,
                    result: Some(ToolResult::Pending {
                        approval: Some(approval),
                        ..
                    }),
                } => (tool_id.clone(), input.clone(), approval.clone()),
                _ => unreachable!(),
            };

        // Re-prepare plugins to get tools.
        let (tools, _context) = self.prepare_all(&mut state, &prompt.output).await?;

        // Find the run_code tool.
        let run_code_tool = tools
            .iter()
            .find(|t| t.id == tool_id_outer)
            .ok_or_else(|| EngineError::ToolNotFound(tool_id_outer.clone()))?;

        // Re-invoke with the replay log.
        let tool_ctx = ToolContext {
            input: serde_json::json!({"code": approval_data.code}),
            state: &mut state,
            extensions: &self.extensions,
            events: &self.events,
            user_id: prompt.user_id.clone(),
            replay: Some(approval_data.replay_log),
        };

        let result = match run_code_tool.invoke.invoke(tool_ctx).await {
            Ok(value) => ToolResult::Success { output: value },
            Err(EngineError::ApprovalRequired { reason, approval }) => {
                ToolResult::Pending {
                    reason,
                    approval: Some(*approval),
                }
            }
            Err(e) => ToolResult::Error {
                error: e.to_string(),
            },
        };

        let is_pending = matches!(
            &result,
            ToolResult::Pending { approval: Some(_), .. }
        );

        // Replace the pending result.
        prompt.output[pending_idx] = PromptOutput::Tool {
            tool_id: tool_id_outer,
            input: tool_input_outer,
            result: Some(result),
        };

        if is_pending {
            prompt.state = PromptState::WaitingForApproval;
            return Ok(prompt);
        }

        // Continue the agent loop.
        prompt.state = PromptState::Running;
        self.run_loop(llm, &mut state, prompt, &[]).await
    }

    /// Reject a pending approval, replacing the pending result with an error
    /// and continuing the agent loop so the model can adapt.
    pub async fn reject(
        &self,
        llm: &dyn LlmClient,
        mut prompt: Prompt,
        reason: &str,
    ) -> Result<Prompt> {
        let mut state = State::new();

        // Find and replace the pending tool result.
        let pending_idx = prompt.output.iter().position(|o| {
            matches!(
                o,
                PromptOutput::Tool {
                    result: Some(ToolResult::Pending {
                        approval: Some(_),
                        ..
                    }),
                    ..
                }
            )
        });

        let pending_idx = pending_idx
            .ok_or_else(|| EngineError::ToolInvocation("no pending approval found".into()))?;

        // Replace with error result.
        if let PromptOutput::Tool {
            tool_id,
            input,
            result,
        } = &mut prompt.output[pending_idx]
        {
            *result = Some(ToolResult::Error {
                error: format!("approval rejected: {reason}"),
            });
            let _ = (tool_id, input); // suppress unused warnings
        }

        prompt.state = PromptState::Running;
        self.run_loop(llm, &mut state, prompt, &[]).await
    }

    /// Inner agent loop, shared by `run`, `approve`, and `reject`.
    async fn run_loop(
        &self,
        llm: &dyn LlmClient,
        state: &mut State,
        mut prompt: Prompt,
        history: &[Prompt],
    ) -> Result<Prompt> {
        let user_id = prompt.user_id.clone();
        let input_text = prompt.input.clone().unwrap_or_default();

        loop {
            // 1. Prepare — collect tools and context from all plugins.
            let (tools, context) = self.prepare_all(state, &prompt.output).await?;

            // 2. Build message list for the LLM.
            let mut messages = Vec::new();

            // System context.
            if !context.is_empty() {
                let ctx_text: String = context
                    .iter()
                    .map(|c| c.content.as_str())
                    .collect::<Vec<_>>()
                    .join("\n\n");
                messages.push(LlmMessage::System(ctx_text));
            }

            // Project historical prompts as conversation history.
            for hist in history {
                if let Some(ref hist_input) = hist.input {
                    messages.push(LlmMessage::User(hist_input.clone()));
                }
                for output in &hist.output {
                    match output {
                        PromptOutput::Text { content } => {
                            messages.push(LlmMessage::Assistant(content.clone()));
                        }
                        PromptOutput::Tool {
                            tool_id,
                            input,
                            result,
                        } => {
                            messages.push(LlmMessage::ToolCall {
                                tool_id: tool_id.clone(),
                                input: input.clone(),
                            });
                            if let Some(result) = result {
                                let output_value = match result {
                                    ToolResult::Success { output } => output.clone(),
                                    ToolResult::Error { error } => {
                                        Value::String(format!("error: {error}"))
                                    }
                                    ToolResult::Pending { reason, .. } => {
                                        Value::String(format!("pending: {reason}"))
                                    }
                                };
                                messages.push(LlmMessage::ToolResponse {
                                    tool_id: tool_id.clone(),
                                    output: output_value,
                                });
                            }
                        }
                        PromptOutput::File { .. } => {}
                    }
                }
            }

            // User input (only on first turn when output is empty).
            if prompt.output.is_empty() {
                messages.push(LlmMessage::User(input_text.clone()));
            }

            // Replay prior outputs as conversation history.
            for output in &prompt.output {
                match output {
                    PromptOutput::Text { content } => {
                        messages.push(LlmMessage::Assistant(content.clone()));
                    }
                    PromptOutput::Tool {
                        tool_id,
                        input,
                        result,
                    } => {
                        messages.push(LlmMessage::ToolCall {
                            tool_id: tool_id.clone(),
                            input: input.clone(),
                        });
                        if let Some(result) = result {
                            let output_value = match result {
                                ToolResult::Success { output } => output.clone(),
                                ToolResult::Error { error } => {
                                    Value::String(format!("error: {error}"))
                                }
                                ToolResult::Pending { reason, .. } => {
                                    Value::String(format!("pending: {reason}"))
                                }
                            };
                            messages.push(LlmMessage::ToolResponse {
                                tool_id: tool_id.clone(),
                                output: output_value,
                            });
                        }
                    }
                    PromptOutput::File { .. } => {
                        // Files are not projected into the LLM conversation.
                    }
                }
            }

            // 3. Call the LLM.
            let tool_refs: Vec<&Tool> = tools.iter().collect();
            let response = llm.call(&messages, &tool_refs).await?;

            // Accumulate usage.
            prompt.usage.prompt_tokens += response.prompt_tokens;
            prompt.usage.completion_tokens += response.completion_tokens;
            prompt.usage.total_tokens += response.prompt_tokens + response.completion_tokens;

            // 4. Process outputs — invoke tools, record results.
            let mut has_tool_calls = false;

            for output in response.outputs {
                match output {
                    PromptOutput::Tool {
                        tool_id,
                        input: tool_input,
                        ..
                    } => {
                        has_tool_calls = true;

                        // Find the tool.
                        let tool = tools
                            .iter()
                            .find(|t| t.id == tool_id)
                            .ok_or_else(|| EngineError::ToolNotFound(tool_id.clone()))?;

                        // Check approval requirement.
                        let needs_approval = match &tool.require_approval {
                            None => None,
                            Some(crate::tool::ApprovalRequirement::Always { reason }) => {
                                Some(reason.clone())
                            }
                            Some(crate::tool::ApprovalRequirement::Dynamic(f)) => {
                                let approval_ctx = crate::tool::ApprovalContext {
                                    extensions: &self.extensions,
                                    user_id: &user_id,
                                };
                                f(&tool_input, &approval_ctx)
                            }
                        };

                        if let Some(reason) = needs_approval {
                            // Park as pending — a real system would pause here.
                            prompt.output.push(PromptOutput::Tool {
                                tool_id,
                                input: tool_input,
                                result: Some(ToolResult::Pending {
                                    reason,
                                    approval: None,
                                }),
                            });
                            prompt.state = PromptState::WaitingForApproval;
                            self.events
                                .publish(&PROMPT_WAITING_FOR_APPROVAL, &prompt)
                                .await;
                            return Ok(prompt);
                        }

                        // Invoke the tool.
                        let tool_ctx = ToolContext {
                            input: tool_input.clone(),
                            state,
                            extensions: &self.extensions,
                            events: &self.events,
                            user_id: user_id.clone(),
                            replay: None,
                        };

                        let result = match tool.invoke.invoke(tool_ctx).await {
                            Ok(value) => ToolResult::Success { output: value },
                            Err(EngineError::ApprovalRequired {
                                reason,
                                approval,
                            }) => ToolResult::Pending {
                                reason,
                                approval: Some(*approval),
                            },
                            Err(e) => ToolResult::Error {
                                error: e.to_string(),
                            },
                        };

                        let is_pending_approval = matches!(
                            &result,
                            ToolResult::Pending { approval: Some(_), .. }
                        );

                        prompt.output.push(PromptOutput::Tool {
                            tool_id,
                            input: tool_input,
                            result: Some(result),
                        });

                        if is_pending_approval {
                            prompt.state = PromptState::WaitingForApproval;
                            self.events
                                .publish(&PROMPT_WAITING_FOR_APPROVAL, &prompt)
                                .await;
                            return Ok(prompt);
                        }
                    }
                    other => {
                        prompt.output.push(other);
                    }
                }
            }

            // 5. If no tool calls were made, the model is done.
            if !has_tool_calls {
                prompt.state = PromptState::Completed;
                self.events.publish(&PROMPT_COMPLETED, &prompt).await;
                return Ok(prompt);
            }

            // Emit update after processing all outputs for this iteration.
            self.events.publish(&PROMPT_UPDATED, &prompt).await;

            // Otherwise, loop — the tool results will be projected as conversation
            // history on the next iteration.
        }
    }
}

impl Default for Engine {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::plugin::Plugin;
    use crate::prompt::PromptUsage;
    use crate::tool::{Tool, ToolInvoke};
    use async_trait::async_trait;
    use serde_json::json;

    // ── Test helpers ─────────────────────────────────────────────────

    struct EchoTool;

    #[async_trait]
    impl ToolInvoke for EchoTool {
        async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
            Ok(ctx.input.clone())
        }
    }

    struct TestPlugin;

    #[async_trait]
    impl Plugin for TestPlugin {
        fn id(&self) -> &str {
            "test"
        }

        async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
            ctx.tools.push(Tool {
                id: "echo".to_string(),
                description: "Echoes input back".to_string(),
                input_schema: json!({"type": "object"}),
                output_schema: None,
                require_approval: None,
                invoke: Box::new(EchoTool),
            });
            Ok(())
        }
    }

    struct MockLlm {
        responses: std::sync::Mutex<Vec<LlmResponse>>,
        calls: std::sync::Mutex<Vec<(Vec<LlmMessage>, Vec<String>)>>,
    }

    impl MockLlm {
        fn new(responses: Vec<LlmResponse>) -> Self {
            Self {
                responses: std::sync::Mutex::new(responses),
                calls: std::sync::Mutex::new(Vec::new()),
            }
        }
    }

    #[async_trait]
    impl LlmClient for MockLlm {
        async fn call(&self, messages: &[LlmMessage], tools: &[&Tool]) -> Result<LlmResponse> {
            self.calls.lock().unwrap().push((
                messages.to_vec(),
                tools.iter().map(|t| t.id.clone()).collect(),
            ));
            let mut responses = self.responses.lock().unwrap();
            if responses.is_empty() {
                Ok(LlmResponse {
                    outputs: vec![PromptOutput::Text {
                        content: "done".into(),
                    }],
                    prompt_tokens: 0,
                    completion_tokens: 0,
                })
            } else {
                Ok(responses.remove(0))
            }
        }
    }

    // ── Tests ────────────────────────────────────────────────────────

    #[tokio::test]
    async fn register_plugin_and_collect_tools() {
        let mut engine = Engine::new();
        engine.register(Box::new(TestPlugin)).await.unwrap();

        let mut state = State::new();
        let (tools, _context) = engine.prepare_all(&mut state, &[]).await.unwrap();

        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].id, "echo");
    }

    #[tokio::test]
    async fn run_text_only_response() {
        let mut engine = Engine::new();
        engine.register(Box::new(TestPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![LlmResponse {
            outputs: vec![PromptOutput::Text {
                content: "Hello!".into(),
            }],
            prompt_tokens: 10,
            completion_tokens: 5,
        }]);

        let prompt = engine.run(&llm, "user-1", "Hi", &[]).await.unwrap();

        assert_eq!(prompt.state, PromptState::Completed);
        assert_eq!(prompt.output.len(), 1);
        assert_eq!(prompt.usage.total_tokens, 15);
    }

    #[tokio::test]
    async fn run_tool_call_then_text() {
        let mut engine = Engine::new();
        engine.register(Box::new(TestPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![
            // Turn 1: model calls the echo tool.
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "echo".into(),
                    input: json!({"msg": "ping"}),
                    result: None,
                }],
                prompt_tokens: 10,
                completion_tokens: 5,
            },
            // Turn 2: model produces a text response.
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "Got it.".into(),
                }],
                prompt_tokens: 20,
                completion_tokens: 3,
            },
        ]);

        let prompt = engine.run(&llm, "user-1", "echo ping", &[]).await.unwrap();

        assert_eq!(prompt.state, PromptState::Completed);
        // Tool call + text output.
        assert_eq!(prompt.output.len(), 2);

        // Verify the tool was invoked and the result recorded.
        match &prompt.output[0] {
            PromptOutput::Tool { tool_id, result, .. } => {
                assert_eq!(tool_id, "echo");
                match result.as_ref().unwrap() {
                    ToolResult::Success { output } => {
                        assert_eq!(output, &json!({"msg": "ping"}));
                    }
                    other => panic!("expected Success, got {other:?}"),
                }
            }
            other => panic!("expected Tool output, got {other:?}"),
        }

        assert_eq!(prompt.usage.total_tokens, 38);
    }

    #[tokio::test]
    async fn approval_gate_pauses_prompt() {
        struct ApprovalPlugin;

        #[async_trait]
        impl Plugin for ApprovalPlugin {
            fn id(&self) -> &str {
                "approval"
            }

            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "dangerous".to_string(),
                    description: "A dangerous tool".to_string(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: Some(crate::tool::ApprovalRequirement::Always {
                        reason: "This is dangerous".to_string(),
                    }),
                    invoke: Box::new(EchoTool),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(ApprovalPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![LlmResponse {
            outputs: vec![PromptOutput::Tool {
                tool_id: "dangerous".into(),
                input: json!({}),
                result: None,
            }],
            prompt_tokens: 10,
            completion_tokens: 5,
        }]);

        let prompt = engine.run(&llm, "user-1", "do it", &[]).await.unwrap();

        assert_eq!(prompt.state, PromptState::WaitingForApproval);
        match &prompt.output[0] {
            PromptOutput::Tool { result, .. } => match result.as_ref().unwrap() {
                ToolResult::Pending { reason, .. } => {
                    assert_eq!(reason, "This is dangerous");
                }
                other => panic!("expected Pending, got {other:?}"),
            },
            other => panic!("expected Tool output, got {other:?}"),
        }
    }

    // ── New tests ───────────────────────────────────────────────────

    #[tokio::test]
    async fn multi_plugin_tool_collection() {
        struct PluginA;
        #[async_trait]
        impl Plugin for PluginA {
            fn id(&self) -> &str {
                "plugin-a"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "tool_a".into(),
                    description: "Tool A".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(EchoTool),
                });
                Ok(())
            }
        }

        struct PluginB;
        #[async_trait]
        impl Plugin for PluginB {
            fn id(&self) -> &str {
                "plugin-b"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "tool_b".into(),
                    description: "Tool B".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(EchoTool),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(PluginA)).await.unwrap();
        engine.register(Box::new(PluginB)).await.unwrap();

        let mut state = State::new();
        let (tools, _) = engine.prepare_all(&mut state, &[]).await.unwrap();

        assert_eq!(tools.len(), 2);
        let ids: Vec<&str> = tools.iter().map(|t| t.id.as_str()).collect();
        assert!(ids.contains(&"tool_a"));
        assert!(ids.contains(&"tool_b"));
    }

    #[tokio::test]
    async fn multi_plugin_state_isolation() {
        struct WriterPlugin {
            plugin_id: String,
            value: String,
        }

        #[async_trait]
        impl Plugin for WriterPlugin {
            fn id(&self) -> &str {
                &self.plugin_id
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.state.set(&self.plugin_id, &self.value)?;
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine
            .register(Box::new(WriterPlugin {
                plugin_id: "alpha".into(),
                value: "aaa".into(),
            }))
            .await
            .unwrap();
        engine
            .register(Box::new(WriterPlugin {
                plugin_id: "beta".into(),
                value: "bbb".into(),
            }))
            .await
            .unwrap();

        let mut state = State::new();
        engine.prepare_all(&mut state, &[]).await.unwrap();

        let alpha: String = state.get("alpha").unwrap().unwrap();
        let beta: String = state.get("beta").unwrap().unwrap();
        assert_eq!(alpha, "aaa");
        assert_eq!(beta, "bbb");
    }

    #[tokio::test]
    async fn tool_not_found_returns_error() {
        let mut engine = Engine::new();
        engine.register(Box::new(TestPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![LlmResponse {
            outputs: vec![PromptOutput::Tool {
                tool_id: "nonexistent".into(),
                input: json!({}),
                result: None,
            }],
            prompt_tokens: 0,
            completion_tokens: 0,
        }]);

        let err = engine.run(&llm, "user-1", "test", &[]).await.unwrap_err();
        assert!(matches!(err, EngineError::ToolNotFound(ref id) if id == "nonexistent"));
    }

    #[tokio::test]
    async fn tool_invoke_error_becomes_tool_result_error() {
        struct FailTool;

        #[async_trait]
        impl ToolInvoke for FailTool {
            async fn invoke(&self, _ctx: ToolContext<'_>) -> Result<Value> {
                Err(EngineError::ToolInvocation("kaboom".into()))
            }
        }

        struct FailPlugin;

        #[async_trait]
        impl Plugin for FailPlugin {
            fn id(&self) -> &str {
                "fail"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "fail_tool".into(),
                    description: "Always fails".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(FailTool),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(FailPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "fail_tool".into(),
                    input: json!({}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "handled".into(),
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        ]);

        let prompt = engine.run(&llm, "user-1", "go", &[]).await.unwrap();
        assert_eq!(prompt.state, PromptState::Completed);

        match &prompt.output[0] {
            PromptOutput::Tool { result, .. } => match result.as_ref().unwrap() {
                ToolResult::Error { error } => assert!(error.contains("kaboom")),
                other => panic!("expected Error, got {other:?}"),
            },
            other => panic!("expected Tool, got {other:?}"),
        }
        match &prompt.output[1] {
            PromptOutput::Text { content } => assert_eq!(content, "handled"),
            other => panic!("expected Text, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn state_persists_across_tool_calls() {
        struct CounterTool;

        #[async_trait]
        impl ToolInvoke for CounterTool {
            async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
                let count: u32 = ctx.state.get::<u32>("counter")?.unwrap_or(0);
                let new_count = count + 1;
                ctx.state.set("counter", &new_count)?;
                Ok(json!({"count": new_count}))
            }
        }

        struct CounterPlugin;

        #[async_trait]
        impl Plugin for CounterPlugin {
            fn id(&self) -> &str {
                "counter"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "increment".into(),
                    description: "Increment counter".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(CounterTool),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(CounterPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "increment".into(),
                    input: json!({}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "increment".into(),
                    input: json!({}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "done".into(),
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        ]);

        let prompt = engine.run(&llm, "user-1", "count twice", &[]).await.unwrap();

        match &prompt.output[0] {
            PromptOutput::Tool { result, .. } => match result.as_ref().unwrap() {
                ToolResult::Success { output } => assert_eq!(output["count"], 1),
                other => panic!("expected Success, got {other:?}"),
            },
            other => panic!("expected Tool, got {other:?}"),
        }
        match &prompt.output[1] {
            PromptOutput::Tool { result, .. } => match result.as_ref().unwrap() {
                ToolResult::Success { output } => assert_eq!(output["count"], 2),
                other => panic!("expected Success, got {other:?}"),
            },
            other => panic!("expected Tool, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn dynamic_approval_gates_on_input() {
        struct TransferPlugin;

        #[async_trait]
        impl Plugin for TransferPlugin {
            fn id(&self) -> &str {
                "transfer"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "transfer".into(),
                    description: "Transfer money".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: Some(crate::tool::ApprovalRequirement::Dynamic(Box::new(
                        |input, _ctx| {
                            let amount =
                                input.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
                            if amount > 1000.0 {
                                Some(format!("High amount: ${amount}"))
                            } else {
                                None
                            }
                        },
                    ))),
                    invoke: Box::new(EchoTool),
                });
                Ok(())
            }
        }

        // Low amount — passes through, tool executes.
        {
            let mut engine = Engine::new();
            engine.register(Box::new(TransferPlugin)).await.unwrap();

            let llm = MockLlm::new(vec![
                LlmResponse {
                    outputs: vec![PromptOutput::Tool {
                        tool_id: "transfer".into(),
                        input: json!({"amount": 50.0}),
                        result: None,
                    }],
                    prompt_tokens: 0,
                    completion_tokens: 0,
                },
                LlmResponse {
                    outputs: vec![PromptOutput::Text {
                        content: "sent $50".into(),
                    }],
                    prompt_tokens: 0,
                    completion_tokens: 0,
                },
            ]);

            let prompt = engine.run(&llm, "user-1", "send money", &[]).await.unwrap();
            assert_eq!(prompt.state, PromptState::Completed);
        }

        // High amount — pauses for approval.
        {
            let mut engine = Engine::new();
            engine.register(Box::new(TransferPlugin)).await.unwrap();

            let llm = MockLlm::new(vec![LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "transfer".into(),
                    input: json!({"amount": 5000.0}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            }]);

            let prompt = engine.run(&llm, "user-1", "send money", &[]).await.unwrap();
            assert_eq!(prompt.state, PromptState::WaitingForApproval);

            match &prompt.output[0] {
                PromptOutput::Tool { result, .. } => match result.as_ref().unwrap() {
                    ToolResult::Pending { reason, .. } => {
                        assert!(reason.contains("High amount"));
                    }
                    other => panic!("expected Pending, got {other:?}"),
                },
                other => panic!("expected Tool, got {other:?}"),
            }
        }
    }

    #[tokio::test]
    async fn tool_accesses_extension_service() {
        struct GreetingService {
            greeting: String,
        }

        struct GreetTool;

        #[async_trait]
        impl ToolInvoke for GreetTool {
            async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
                let svc = ctx
                    .extensions
                    .get::<GreetingService>()
                    .ok_or_else(|| EngineError::ToolInvocation("no greeting service".into()))?;
                Ok(json!({"message": svc.greeting}))
            }
        }

        struct GreetPlugin;

        #[async_trait]
        impl Plugin for GreetPlugin {
            fn id(&self) -> &str {
                "greet"
            }
            async fn setup(&self, ctx: &mut crate::plugin::SetupContext<'_>) -> Result<()> {
                ctx.extensions.insert(GreetingService {
                    greeting: "Hello, World!".into(),
                });
                Ok(())
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "greet".into(),
                    description: "Greet".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(GreetTool),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(GreetPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "greet".into(),
                    input: json!({}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "greeted".into(),
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        ]);

        let prompt = engine.run(&llm, "user-1", "greet me", &[]).await.unwrap();

        match &prompt.output[0] {
            PromptOutput::Tool { result, .. } => match result.as_ref().unwrap() {
                ToolResult::Success { output } => {
                    assert_eq!(output["message"], "Hello, World!");
                }
                other => panic!("expected Success, got {other:?}"),
            },
            other => panic!("expected Tool, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn message_projection_after_tool_call() {
        struct ContextPlugin;

        #[async_trait]
        impl Plugin for ContextPlugin {
            fn id(&self) -> &str {
                "ctx"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.context.push(ContextItem {
                    item_type: "text".into(),
                    id: None,
                    content: "You are helpful.".into(),
                });
                ctx.tools.push(Tool {
                    id: "echo".into(),
                    description: "Echo".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(EchoTool),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(ContextPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "echo".into(),
                    input: json!({"x": 1}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "done".into(),
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        ]);

        engine.run(&llm, "user-1", "test", &[]).await.unwrap();

        let calls = llm.calls.lock().unwrap();
        assert_eq!(calls.len(), 2);

        // Turn 1: System + User
        let (msgs1, _) = &calls[0];
        assert_eq!(msgs1.len(), 2);
        assert!(matches!(&msgs1[0], LlmMessage::System(_)));
        assert!(matches!(&msgs1[1], LlmMessage::User(_)));

        // Turn 2: System + ToolCall + ToolResponse — no User
        let (msgs2, _) = &calls[1];
        assert_eq!(msgs2.len(), 3);
        assert!(matches!(&msgs2[0], LlmMessage::System(_)));
        assert!(matches!(&msgs2[1], LlmMessage::ToolCall { .. }));
        assert!(matches!(&msgs2[2], LlmMessage::ToolResponse { .. }));
        assert!(!msgs2.iter().any(|m| matches!(m, LlmMessage::User(_))));
    }

    #[tokio::test]
    async fn plugin_prepare_failure_mid_loop() {
        use std::sync::atomic::{AtomicU32, Ordering};

        struct FlakeyPlugin {
            call_count: AtomicU32,
        }

        #[async_trait]
        impl Plugin for FlakeyPlugin {
            fn id(&self) -> &str {
                "flakey"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                let count = self.call_count.fetch_add(1, Ordering::SeqCst);
                if count >= 1 {
                    return Err(EngineError::PluginPrepare("flakey failed".into()));
                }
                ctx.tools.push(Tool {
                    id: "tool".into(),
                    description: "A tool".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(EchoTool),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine
            .register(Box::new(FlakeyPlugin {
                call_count: AtomicU32::new(0),
            }))
            .await
            .unwrap();

        let llm = MockLlm::new(vec![LlmResponse {
            outputs: vec![PromptOutput::Tool {
                tool_id: "tool".into(),
                input: json!({}),
                result: None,
            }],
            prompt_tokens: 0,
            completion_tokens: 0,
        }]);

        let err = engine.run(&llm, "user-1", "test", &[]).await.unwrap_err();
        assert!(matches!(err, EngineError::PluginPrepare(_)));
    }

    #[tokio::test]
    async fn multiple_tool_calls_in_single_response() {
        struct MultiToolPlugin;

        #[async_trait]
        impl Plugin for MultiToolPlugin {
            fn id(&self) -> &str {
                "multi"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "tool_x".into(),
                    description: "X".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(EchoTool),
                });
                ctx.tools.push(Tool {
                    id: "tool_y".into(),
                    description: "Y".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(EchoTool),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(MultiToolPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![
            LlmResponse {
                outputs: vec![
                    PromptOutput::Tool {
                        tool_id: "tool_x".into(),
                        input: json!({"from": "x"}),
                        result: None,
                    },
                    PromptOutput::Tool {
                        tool_id: "tool_y".into(),
                        input: json!({"from": "y"}),
                        result: None,
                    },
                ],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "both done".into(),
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        ]);

        let prompt = engine.run(&llm, "user-1", "do both", &[]).await.unwrap();
        assert_eq!(prompt.state, PromptState::Completed);
        assert_eq!(prompt.output.len(), 3); // 2 tool calls + 1 text

        match &prompt.output[0] {
            PromptOutput::Tool { tool_id, result, .. } => {
                assert_eq!(tool_id, "tool_x");
                assert!(matches!(result.as_ref().unwrap(), ToolResult::Success { .. }));
            }
            other => panic!("expected Tool, got {other:?}"),
        }
        match &prompt.output[1] {
            PromptOutput::Tool { tool_id, result, .. } => {
                assert_eq!(tool_id, "tool_y");
                assert!(matches!(result.as_ref().unwrap(), ToolResult::Success { .. }));
            }
            other => panic!("expected Tool, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn sandbox_approval_required_pauses_prompt() {
        use crate::sandbox::PendingApproval;

        struct SandboxApprovalPlugin;

        struct FakeRunCode;

        #[async_trait]
        impl ToolInvoke for FakeRunCode {
            async fn invoke(&self, _ctx: ToolContext<'_>) -> Result<Value> {
                Err(EngineError::ApprovalRequired {
                    reason: "writes to disk".into(),
                    approval: Box::new(PendingApproval {
                        code: "fs_write('a','b')".into(),
                        replay_log: vec![],
                        tool_id: "fs_write".into(),
                        tool_input: serde_json::json!({"path": "a"}),
                        approval_reason: "writes to disk".into(),
                    }),
                })
            }
        }

        #[async_trait]
        impl Plugin for SandboxApprovalPlugin {
            fn id(&self) -> &str {
                "sandbox-approval"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "run_code".into(),
                    description: "Run code".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(FakeRunCode),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(SandboxApprovalPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![LlmResponse {
            outputs: vec![PromptOutput::Tool {
                tool_id: "run_code".into(),
                input: json!({"code": "fs_write('a','b')"}),
                result: None,
            }],
            prompt_tokens: 10,
            completion_tokens: 5,
        }]);

        let prompt = engine.run(&llm, "user-1", "write file", &[]).await.unwrap();

        assert_eq!(prompt.state, PromptState::WaitingForApproval);
        match &prompt.output[0] {
            PromptOutput::Tool { result, .. } => match result.as_ref().unwrap() {
                ToolResult::Pending {
                    reason,
                    approval: Some(approval),
                } => {
                    assert_eq!(reason, "writes to disk");
                    assert_eq!(approval.tool_id, "fs_write");
                }
                other => panic!("expected Pending with approval, got {other:?}"),
            },
            other => panic!("expected Tool output, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn approve_resumes_and_completes() {
        use crate::sandbox::PendingApproval;
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        struct ResumePlugin {
            call_count: Arc<AtomicU32>,
        }

        struct ResumeRunCode {
            call_count: Arc<AtomicU32>,
        }

        #[async_trait]
        impl ToolInvoke for ResumeRunCode {
            async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
                let n = self.call_count.fetch_add(1, Ordering::SeqCst);
                if n == 0 {
                    // First invocation: needs approval.
                    Err(EngineError::ApprovalRequired {
                        reason: "dangerous".into(),
                        approval: Box::new(PendingApproval {
                            code: ctx.input["code"].as_str().unwrap_or("").to_string(),
                            replay_log: vec![],
                            tool_id: "inner".into(),
                            tool_input: json!({}),
                            approval_reason: "dangerous".into(),
                        }),
                    })
                } else {
                    // Second invocation (after approval): succeeds.
                    assert!(ctx.replay.is_some(), "replay log should be passed on resume");
                    Ok(json!({"value": "completed", "console_output": []}))
                }
            }
        }

        #[async_trait]
        impl Plugin for ResumePlugin {
            fn id(&self) -> &str {
                "resume"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "run_code".into(),
                    description: "Run code".into(),
                    input_schema: json!({"type": "object", "properties": {"code": {"type": "string"}}, "required": ["code"]}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(ResumeRunCode {
                        call_count: self.call_count.clone(),
                    }),
                });
                Ok(())
            }
        }

        let counter = Arc::new(AtomicU32::new(0));
        let mut engine = Engine::new();
        engine
            .register(Box::new(ResumePlugin {
                call_count: counter,
            }))
            .await
            .unwrap();

        // Step 1: Initial run pauses for approval.
        let llm = MockLlm::new(vec![
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "run_code".into(),
                    input: json!({"code": "do_stuff()"}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            // After approval, the agent loop continues and gets final text.
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "all done".into(),
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        ]);

        let prompt = engine.run(&llm, "user-1", "go", &[]).await.unwrap();
        assert_eq!(prompt.state, PromptState::WaitingForApproval);

        // Step 2: Approve — should resume and complete.
        let prompt = engine.approve(&llm, prompt).await.unwrap();
        assert_eq!(prompt.state, PromptState::Completed);

        // The tool result should now be Success.
        match &prompt.output[0] {
            PromptOutput::Tool { result, .. } => {
                assert!(
                    matches!(result.as_ref().unwrap(), ToolResult::Success { .. }),
                    "expected Success, got {:?}",
                    result
                );
            }
            other => panic!("expected Tool, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn reject_continues_with_error() {
        use crate::sandbox::PendingApproval;

        struct RejectPlugin;

        struct RejectRunCode;

        #[async_trait]
        impl ToolInvoke for RejectRunCode {
            async fn invoke(&self, _ctx: ToolContext<'_>) -> Result<Value> {
                Err(EngineError::ApprovalRequired {
                    reason: "dangerous".into(),
                    approval: Box::new(PendingApproval {
                        code: "rm()".into(),
                        replay_log: vec![],
                        tool_id: "rm".into(),
                        tool_input: json!({}),
                        approval_reason: "dangerous".into(),
                    }),
                })
            }
        }

        #[async_trait]
        impl Plugin for RejectPlugin {
            fn id(&self) -> &str {
                "reject"
            }
            async fn prepare(&self, ctx: &mut crate::plugin::PrepareContext<'_>) -> Result<()> {
                ctx.tools.push(Tool {
                    id: "run_code".into(),
                    description: "Run code".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    require_approval: None,
                    invoke: Box::new(RejectRunCode),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(RejectPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![
            // Initial: model calls run_code.
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "run_code".into(),
                    input: json!({"code": "rm()"}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            // After rejection: model sees error and adapts.
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "ok, I won't do that".into(),
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        ]);

        let prompt = engine.run(&llm, "user-1", "delete stuff", &[]).await.unwrap();
        assert_eq!(prompt.state, PromptState::WaitingForApproval);

        let prompt = engine.reject(&llm, prompt, "not allowed").await.unwrap();
        assert_eq!(prompt.state, PromptState::Completed);

        // The tool result should be Error with rejection message.
        match &prompt.output[0] {
            PromptOutput::Tool { result, .. } => match result.as_ref().unwrap() {
                ToolResult::Error { error } => {
                    assert!(error.contains("not allowed"), "expected rejection reason in: {error}");
                }
                other => panic!("expected Error, got {other:?}"),
            },
            other => panic!("expected Tool, got {other:?}"),
        }
    }

    #[tokio::test]
    async fn prompt_events_emitted_on_run() {
        use crate::prompt_events::{PROMPT_COMPLETED, PROMPT_CREATED};

        let mut engine = Engine::new();
        engine.register(Box::new(TestPlugin)).await.unwrap();

        let mut rx_created = engine.events.subscribe::<Prompt>(&PROMPT_CREATED).await;
        let mut rx_completed = engine.events.subscribe::<Prompt>(&PROMPT_COMPLETED).await;

        let llm = MockLlm::new(vec![LlmResponse {
            outputs: vec![PromptOutput::Text {
                content: "hi".into(),
            }],
            prompt_tokens: 0,
            completion_tokens: 0,
        }]);

        let prompt = engine.run(&llm, "user-1", "hello", &[]).await.unwrap();

        let created: Prompt =
            serde_json::from_value(rx_created.recv().await.unwrap()).unwrap();
        assert_eq!(created.id, prompt.id);
        assert_eq!(created.state, PromptState::Running);

        let completed: Prompt =
            serde_json::from_value(rx_completed.recv().await.unwrap()).unwrap();
        assert_eq!(completed.id, prompt.id);
        assert_eq!(completed.state, PromptState::Completed);
    }

    #[tokio::test]
    async fn prompt_updated_event_emitted_between_turns() {
        use crate::prompt_events::PROMPT_UPDATED;

        let mut engine = Engine::new();
        engine.register(Box::new(TestPlugin)).await.unwrap();

        let mut rx_updated = engine.events.subscribe::<Prompt>(&PROMPT_UPDATED).await;

        let llm = MockLlm::new(vec![
            LlmResponse {
                outputs: vec![PromptOutput::Tool {
                    tool_id: "echo".into(),
                    input: json!({"x": 1}),
                    result: None,
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
            LlmResponse {
                outputs: vec![PromptOutput::Text {
                    content: "done".into(),
                }],
                prompt_tokens: 0,
                completion_tokens: 0,
            },
        ]);

        engine.run(&llm, "user-1", "test", &[]).await.unwrap();

        let updated: Prompt =
            serde_json::from_value(rx_updated.recv().await.unwrap()).unwrap();
        assert_eq!(updated.state, PromptState::Running);
        assert_eq!(updated.output.len(), 1); // tool call recorded
    }

    #[tokio::test]
    async fn history_projected_before_current_input() {
        let mut engine = Engine::new();
        engine.register(Box::new(TestPlugin)).await.unwrap();

        let llm = MockLlm::new(vec![LlmResponse {
            outputs: vec![PromptOutput::Text {
                content: "response".into(),
            }],
            prompt_tokens: 0,
            completion_tokens: 0,
        }]);

        let history_prompt = Prompt {
            id: "hist-1".into(),
            user_id: "user-1".into(),
            state: PromptState::Completed,
            input: Some("previous question".into()),
            output: vec![PromptOutput::Text {
                content: "previous answer".into(),
            }],
            usage: PromptUsage::default(),
        };

        engine
            .run(&llm, "user-1", "new question", &[history_prompt])
            .await
            .unwrap();

        let calls = llm.calls.lock().unwrap();
        assert_eq!(calls.len(), 1);

        let (msgs, _) = &calls[0];
        // Should be: User("previous question"), Assistant("previous answer"), User("new question")
        let user_msgs: Vec<_> = msgs
            .iter()
            .filter(|m| matches!(m, LlmMessage::User(_)))
            .collect();
        assert_eq!(user_msgs.len(), 2);

        let assistant_msgs: Vec<_> = msgs
            .iter()
            .filter(|m| matches!(m, LlmMessage::Assistant(_)))
            .collect();
        assert_eq!(assistant_msgs.len(), 1);
    }

    #[tokio::test]
    async fn action_register_and_invoke() {
        use crate::action::{Action, ActionContext, ActionInvoke};

        struct AddAction;

        #[async_trait]
        impl ActionInvoke for AddAction {
            async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value> {
                let a = ctx.input["a"].as_i64().unwrap_or(0);
                let b = ctx.input["b"].as_i64().unwrap_or(0);
                Ok(json!({"sum": a + b}))
            }
        }

        struct ActionPlugin;

        #[async_trait]
        impl Plugin for ActionPlugin {
            fn id(&self) -> &str {
                "action-test"
            }
            async fn setup(&self, ctx: &mut crate::plugin::SetupContext<'_>) -> Result<()> {
                ctx.actions.push(Action {
                    id: "add".into(),
                    description: "Add two numbers".into(),
                    input_schema: json!({"type": "object"}),
                    output_schema: None,
                    invoke: Box::new(AddAction),
                });
                Ok(())
            }
        }

        let mut engine = Engine::new();
        engine.register(Box::new(ActionPlugin)).await.unwrap();

        assert_eq!(engine.actions().len(), 1);
        assert_eq!(engine.actions()[0].id, "add");

        let result = engine
            .invoke_action("add", "user-1", json!({"a": 3, "b": 4}))
            .await
            .unwrap();
        assert_eq!(result["sum"], 7);
    }

    #[tokio::test]
    async fn action_not_found_returns_error() {
        let engine = Engine::new();
        let err = engine
            .invoke_action("nonexistent", "user-1", json!({}))
            .await
            .unwrap_err();
        assert!(matches!(err, EngineError::ActionNotFound(ref id) if id == "nonexistent"));
    }
}
