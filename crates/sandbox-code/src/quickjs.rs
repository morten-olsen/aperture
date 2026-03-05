use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use async_trait::async_trait;
use rquickjs::{Context, Ctx, Function, Object, Runtime};
use serde_json::Value;
use tokio::sync::mpsc;

use aperture_engine::error::{EngineError, Result as EngineResult};
use aperture_engine::sandbox::{SandboxRequest, SandboxResult, ToolDescriptor};

/// Trait abstracting the code sandbox, allowing alternative implementations.
#[async_trait]
pub trait CodeSandbox: Send + Sync {
    async fn execute(
        &self,
        code: &str,
        tools: &[ToolDescriptor],
        caller: mpsc::Sender<SandboxRequest>,
        interrupt: Arc<AtomicBool>,
    ) -> EngineResult<SandboxResult>;
}

pub struct QuickJsSandbox;

impl QuickJsSandbox {
    pub fn new() -> Self {
        Self
    }
}

impl Default for QuickJsSandbox {
    fn default() -> Self {
        Self::new()
    }
}

#[async_trait]
impl CodeSandbox for QuickJsSandbox {
    async fn execute(
        &self,
        code: &str,
        tools: &[ToolDescriptor],
        caller: mpsc::Sender<SandboxRequest>,
        interrupt: Arc<AtomicBool>,
    ) -> EngineResult<SandboxResult> {
        let code = code.to_string();
        let tools = tools.to_vec();

        tokio::task::spawn_blocking(move || execute_sync(&code, &tools, caller, interrupt))
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("sandbox task panicked: {e}")))?
    }
}

/// Run JS code synchronously on a blocking thread.
///
/// Tool calls block the thread via `blocking_send`/`blocking_recv` on tokio
/// channels, while the host loop (async) services them from the other end.
fn execute_sync(
    code: &str,
    tools: &[ToolDescriptor],
    caller: mpsc::Sender<SandboxRequest>,
    interrupt: Arc<AtomicBool>,
) -> EngineResult<SandboxResult> {
    let rt = Runtime::new()
        .map_err(|e| EngineError::ToolInvocation(format!("QuickJS runtime init: {e}")))?;

    let flag = interrupt.clone();
    rt.set_interrupt_handler(Some(Box::new(move || flag.load(Ordering::Acquire))));

    let ctx = Context::full(&rt)
        .map_err(|e| EngineError::ToolInvocation(format!("QuickJS context init: {e}")))?;

    let console_output: Arc<Mutex<Vec<String>>> = Arc::new(Mutex::new(Vec::new()));

    let result = ctx.with(|ctx| -> EngineResult<Value> {
        register_console(&ctx, console_output.clone())
            .map_err(|e| EngineError::ToolInvocation(format!("register console: {e}")))?;

        register_tool_call(&ctx, caller.clone())
            .map_err(|e| EngineError::ToolInvocation(format!("register __tool_call: {e}")))?;

        register_date_now(&ctx, caller.clone())
            .map_err(|e| EngineError::ToolInvocation(format!("register __date_now: {e}")))?;

        register_math_random(&ctx, caller)
            .map_err(|e| EngineError::ToolInvocation(format!("register __math_random: {e}")))?;

        let wrappers = generate_tool_wrappers(tools);
        let full_code = format!("{wrappers}\n{code}");

        match ctx.eval::<rquickjs::Value, _>(full_code.as_bytes()) {
            Ok(value) => js_to_json(&ctx, value),
            Err(e) => {
                let caught = ctx.catch();
                Err(format_js_error(&ctx, e, caught))
            }
        }
    });

    let console = console_output.lock().unwrap().clone();

    match result {
        Ok(value) => Ok(SandboxResult {
            value,
            console_output: console,
        }),
        Err(e) => {
            // If interrupted, return a clean error (not the internal "interrupted" message).
            if interrupt.load(Ordering::Acquire) {
                return Err(EngineError::ToolInvocation(
                    "sandbox execution interrupted".into(),
                ));
            }
            // Return errors as structured JSON so the LLM can see console output
            // alongside the error.
            let error_json = serde_json::json!({
                "error": e.to_string(),
                "console_output": console,
            });
            Err(EngineError::ToolInvocation(error_json.to_string()))
        }
    }
}

/// Register `console.log` that captures output to a shared buffer.
///
/// The Rust side only receives a pre-formatted string via `__console_push`.
/// The JS-side `console.log` handles variadic args and stringification
/// (including `JSON.stringify` for objects) so we avoid rquickjs lifetime issues.
fn register_console(ctx: &Ctx<'_>, buf: Arc<Mutex<Vec<String>>>) -> rquickjs::Result<()> {
    let push_fn = Function::new(ctx.clone(), move |line: String| {
        buf.lock().unwrap().push(line);
    })?
    .with_name("__console_push")?;

    ctx.globals().set("__console_push", push_fn)?;

    ctx.eval::<(), _>(
        br#"
        globalThis.console = {
            log: function() {
                var parts = [];
                for (var i = 0; i < arguments.length; i++) {
                    var v = arguments[i];
                    if (typeof v === 'string') {
                        parts.push(v);
                    } else if (v === null) {
                        parts.push('null');
                    } else if (v === undefined) {
                        parts.push('undefined');
                    } else {
                        try { parts.push(JSON.stringify(v)); }
                        catch(e) { parts.push(String(v)); }
                    }
                }
                __console_push(parts.join(' '));
            }
        };
        "#,
    )?;

    Ok(())
}

/// Register the `__tool_call(tool_id, input_json) -> result_json` bridge function.
fn register_tool_call(
    ctx: &Ctx<'_>,
    tx: mpsc::Sender<SandboxRequest>,
) -> rquickjs::Result<()> {
    let func = Function::new(
        ctx.clone(),
        move |ctx: Ctx<'_>, tool_id: String, input_json: String| -> rquickjs::Result<String> {
            let input: serde_json::Value = serde_json::from_str(&input_json).map_err(|e| {
                throw(&ctx, &format!("Invalid JSON input: {e}"))
            })?;

            let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
            let request = SandboxRequest::ToolCall {
                tool_id: tool_id.clone(),
                input,
                response: resp_tx,
            };

            tx.blocking_send(request)
                .map_err(|_| throw(&ctx, "Host loop closed"))?;

            let result = resp_rx
                .blocking_recv()
                .map_err(|_| throw(&ctx, "Host dropped response channel"))?;

            match result {
                Ok(value) => serde_json::to_string(&value)
                    .map_err(|e| throw(&ctx, &format!("Failed to serialize result: {e}"))),
                Err(EngineError::ToolError { message, data }) => {
                    Err(throw_structured(&ctx, &message, &data))
                }
                Err(e) => Err(throw(&ctx, &format!("Tool '{tool_id}' failed: {e}"))),
            }
        },
    )?
    .with_name("__tool_call")?;

    ctx.globals().set("__tool_call", func)?;
    Ok(())
}

/// Register `__date_now()` bridge that sends a `SandboxRequest::DateNow`
/// and returns the value from the host loop.
fn register_date_now(
    ctx: &Ctx<'_>,
    tx: mpsc::Sender<SandboxRequest>,
) -> rquickjs::Result<()> {
    let func = Function::new(
        ctx.clone(),
        move |ctx: Ctx<'_>| -> rquickjs::Result<f64> {
            let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
            tx.blocking_send(SandboxRequest::DateNow { response: resp_tx })
                .map_err(|_| throw(&ctx, "Host loop closed"))?;
            resp_rx
                .blocking_recv()
                .map_err(|_| throw(&ctx, "Host dropped response channel"))
        },
    )?
    .with_name("__date_now")?;

    ctx.globals().set("__date_now", func)?;

    // Override Date.now to use the bridge.
    ctx.eval::<(), _>(b"Date.now = function() { return __date_now(); };")?;

    Ok(())
}

/// Register `__math_random()` bridge that sends a `SandboxRequest::MathRandom`
/// and returns the value from the host loop.
fn register_math_random(
    ctx: &Ctx<'_>,
    tx: mpsc::Sender<SandboxRequest>,
) -> rquickjs::Result<()> {
    let func = Function::new(
        ctx.clone(),
        move |ctx: Ctx<'_>| -> rquickjs::Result<f64> {
            let (resp_tx, resp_rx) = tokio::sync::oneshot::channel();
            tx.blocking_send(SandboxRequest::MathRandom { response: resp_tx })
                .map_err(|_| throw(&ctx, "Host loop closed"))?;
            resp_rx
                .blocking_recv()
                .map_err(|_| throw(&ctx, "Host dropped response channel"))
        },
    )?
    .with_name("__math_random")?;

    ctx.globals().set("__math_random", func)?;

    // Override Math.random to use the bridge.
    ctx.eval::<(), _>(b"Math.random = function() { return __math_random(); };")?;

    Ok(())
}

/// Throw a JS Error with the given message. Returns `rquickjs::Error::Exception`.
fn throw(ctx: &Ctx<'_>, message: &str) -> rquickjs::Error {
    // Try to create a proper Error object; fall back to throwing a string.
    let code = format!(
        "new Error({})",
        serde_json::to_string(message).unwrap_or_else(|_| format!("\"{}\"", message))
    );
    if let Ok(err_val) = ctx.eval::<rquickjs::Value, _>(code.as_bytes()) {
        ctx.throw(err_val)
    } else if let Ok(s) = rquickjs::String::from_str(ctx.clone(), message) {
        ctx.throw(s.into())
    } else {
        rquickjs::Error::Unknown
    }
}

/// Throw a JS Error with custom properties from a `Value` object.
///
/// Creates `new Error(message)` then sets each key from `data` as a property
/// on the error object, allowing JS catch blocks to access structured data.
fn throw_structured(ctx: &Ctx<'_>, message: &str, data: &Value) -> rquickjs::Error {
    let code = format!(
        "new Error({})",
        serde_json::to_string(message).unwrap_or_else(|_| format!("\"{}\"", message))
    );
    let err_val = match ctx.eval::<rquickjs::Value, _>(code.as_bytes()) {
        Ok(v) => v,
        Err(_) => return throw(ctx, message),
    };

    if let (Some(err_obj), Some(data_map)) = (err_val.as_object(), data.as_object()) {
        for (key, val) in data_map {
            let json_str = serde_json::to_string(val).unwrap_or_default();
            let parse_code = format!("JSON.parse({})", serde_json::to_string(&json_str).unwrap_or_default());
            if let Ok(js_val) = ctx.eval::<rquickjs::Value, _>(parse_code.as_bytes()) {
                let _ = err_obj.set(key.as_str(), js_val);
            }
        }
    }

    ctx.throw(err_val)
}

/// Generate JS wrapper functions for each tool descriptor.
///
/// Each tool becomes a global synchronous function that delegates to `__tool_call`.
/// Wrappers accept both positional arguments (matching the listing signature)
/// and a single-object argument: `fs_write("path", "content")` and
/// `fs_write({path: "path", content: "content"})` both work.
fn generate_tool_wrappers(tools: &[ToolDescriptor]) -> String {
    tools
        .iter()
        .map(generate_single_wrapper)
        .collect::<Vec<_>>()
        .join("\n")
}

/// Extract ordered parameter names from a tool's input JSON Schema.
/// Required parameters come first (in `required` array order),
/// then optional parameters alphabetically.
fn extract_param_names(schema: &Value) -> Vec<String> {
    let properties = match schema.get("properties").and_then(|p| p.as_object()) {
        Some(p) if !p.is_empty() => p,
        _ => return vec![],
    };

    let required: Vec<&str> = schema
        .get("required")
        .and_then(|r| r.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();

    let mut names = Vec::new();
    for name in &required {
        if properties.contains_key(*name) {
            names.push(name.to_string());
        }
    }

    let mut optional: Vec<&String> = properties
        .keys()
        .filter(|k| !required.contains(&k.as_str()))
        .collect();
    optional.sort();
    for name in optional {
        names.push(name.clone());
    }

    names
}

/// Generate a JS wrapper for a single tool.
fn generate_single_wrapper(tool: &ToolDescriptor) -> String {
    let name = &tool.id;
    let param_names = extract_param_names(&tool.input_schema);

    if param_names.is_empty() {
        // No parameters — accept optional object arg.
        return format!(
            "function {name}(input) {{\n\
             \x20 return JSON.parse(__tool_call(\"{name}\", JSON.stringify(input !== undefined ? input : {{}})));\n\
             }}"
        );
    }

    // Generate wrapper accepting positional args OR a single object.
    let params_list = param_names.join(", ");
    let assignments: String = param_names
        .iter()
        .map(|n| format!("    if ({n} !== undefined) __args.{n} = {n};"))
        .collect::<Vec<_>>()
        .join("\n");

    format!(
        "function {name}({params_list}) {{\n\
         \x20 var __args;\n\
         \x20 if (arguments.length === 1 && typeof arguments[0] === 'object' && arguments[0] !== null) {{\n\
         \x20   __args = arguments[0];\n\
         \x20 }} else {{\n\
         \x20   __args = {{}};\n\
         {assignments}\n\
         \x20 }}\n\
         \x20 return JSON.parse(__tool_call(\"{name}\", JSON.stringify(__args)));\n\
         }}"
    )
}

/// Convert a JS value to serde_json::Value via JSON.stringify.
fn js_to_json<'js>(ctx: &Ctx<'js>, value: rquickjs::Value<'js>) -> EngineResult<Value> {
    if value.is_undefined() || value.is_null() {
        return Ok(Value::Null);
    }

    let json: Object = ctx
        .globals()
        .get("JSON")
        .map_err(|e| EngineError::ToolInvocation(format!("JSON global: {e}")))?;
    let stringify: Function = json
        .get("stringify")
        .map_err(|e| EngineError::ToolInvocation(format!("JSON.stringify: {e}")))?;

    let json_str: Option<String> = stringify
        .call((value,))
        .map_err(|e| EngineError::ToolInvocation(format!("JSON.stringify call: {e}")))?;

    match json_str {
        Some(s) => serde_json::from_str(&s).map_err(|e| e.into()),
        None => Ok(Value::Null),
    }
}

/// Format a JS exception into an EngineError with message and stack trace.
fn format_js_error(
    _ctx: &Ctx<'_>,
    original_error: rquickjs::Error,
    caught: rquickjs::Value<'_>,
) -> EngineError {
    if caught.is_undefined() {
        return EngineError::ToolInvocation(format!("JS error: {original_error}"));
    }

    // Try to extract .message and .stack from an Error object
    if let Some(obj) = caught.as_object() {
        let message: String = obj
            .get("message")
            .unwrap_or_else(|_| format!("{original_error}"));
        let stack: Option<String> = obj.get("stack").ok();

        let mut error_msg = message;
        if let Some(stack) = stack {
            error_msg = format!("{error_msg}\n{stack}");
        }
        return EngineError::ToolInvocation(error_msg);
    }

    // Fall back to string representation
    if let Some(s) = caught.as_string() {
        let msg = s.to_string().unwrap_or_else(|_| format!("{original_error}"));
        return EngineError::ToolInvocation(msg);
    }

    EngineError::ToolInvocation(format!("JS error: {original_error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    /// Run JS code with no tools (no bridged calls).
    async fn run_simple(code: &str) -> EngineResult<SandboxResult> {
        let sandbox = QuickJsSandbox::new();
        let (tx, mut rx) = mpsc::channel::<SandboxRequest>(32);
        let interrupt = Arc::new(AtomicBool::new(false));
        let code = code.to_string();

        let handle = tokio::spawn(async move {
            sandbox.execute(&code, &[], tx, interrupt).await
        });

        // Service Date.now/Math.random requests even in "simple" mode.
        while let Some(req) = rx.recv().await {
            match req {
                SandboxRequest::DateNow { response } => {
                    let _ = response.send(1709568000000.0);
                }
                SandboxRequest::MathRandom { response } => {
                    let _ = response.send(0.5);
                }
                SandboxRequest::ToolCall { response, .. } => {
                    let _ = response.send(Err(EngineError::ToolNotFound(
                        "no tools registered".into(),
                    )));
                }
            }
        }

        handle.await.unwrap()
    }

    /// Run JS code with one mock tool, using a host loop that invokes the given
    /// handler for each tool call.
    async fn run_with_tool<F>(
        code: &str,
        tool: ToolDescriptor,
        handler: F,
    ) -> EngineResult<SandboxResult>
    where
        F: Fn(String, Value) -> EngineResult<Value> + Send + 'static,
    {
        let sandbox = QuickJsSandbox::new();
        let tools = vec![tool];
        let (tx, mut rx) = mpsc::channel::<SandboxRequest>(32);
        let interrupt = Arc::new(AtomicBool::new(false));
        let code = code.to_string();

        let handle = tokio::spawn(async move {
            sandbox.execute(&code, &tools, tx, interrupt).await
        });

        // Host loop: service requests.
        while let Some(req) = rx.recv().await {
            match req {
                SandboxRequest::ToolCall {
                    tool_id,
                    input,
                    response,
                } => {
                    let result = handler(tool_id, input);
                    let _ = response.send(result);
                }
                SandboxRequest::DateNow { response } => {
                    let _ = response.send(1709568000000.0);
                }
                SandboxRequest::MathRandom { response } => {
                    let _ = response.send(0.42);
                }
            }
        }

        handle.await.unwrap()
    }

    fn echo_tool() -> ToolDescriptor {
        ToolDescriptor {
            id: "echo".into(),
            description: "Echoes input back".into(),
            input_schema: json!({"type": "object", "properties": {"msg": {"type": "string"}}}),
            output_schema: None,
        }
    }

    // ── Integration tests ───────────────────────────────────────────

    #[tokio::test]
    async fn simple_js_returns_value() {
        let result = run_simple("1 + 2").await.unwrap();
        assert_eq!(result.value, json!(3));
        assert!(result.console_output.is_empty());
    }

    #[tokio::test]
    async fn captures_console_log() {
        let result = run_simple(
            r#"
            console.log("hello", "world");
            console.log("line two");
            42
            "#,
        )
        .await
        .unwrap();

        assert_eq!(result.value, json!(42));
        assert_eq!(result.console_output.len(), 2);
        assert_eq!(result.console_output[0], "hello world");
        assert_eq!(result.console_output[1], "line two");
    }

    #[tokio::test]
    async fn calls_bridged_tool() {
        let result = run_with_tool(
            r#"echo({msg: "ping"})"#,
            echo_tool(),
            |_tool_id, input| Ok(json!({"echoed": input["msg"]})),
        )
        .await
        .unwrap();

        assert_eq!(result.value["echoed"], "ping");
    }

    #[tokio::test]
    async fn tool_error_throws_js_exception() {
        let result = run_with_tool(
            r#"
            try {
                echo({msg: "fail"});
            } catch (e) {
                ({caught: e.message});
            }
            "#,
            echo_tool(),
            |_tool_id, _input| Err(EngineError::ToolInvocation("kaboom".into())),
        )
        .await
        .unwrap();

        let caught = result.value["caught"].as_str().unwrap();
        assert!(caught.contains("kaboom"), "expected 'kaboom' in: {caught}");
    }

    #[tokio::test]
    async fn uncaught_exception_returns_error() {
        let err = run_simple("throw new Error('intentional')").await.unwrap_err();
        let msg = err.to_string();
        // The error JSON should contain our message and console output.
        assert!(
            msg.contains("intentional"),
            "expected 'intentional' in: {msg}"
        );
    }

    #[tokio::test]
    async fn uncaught_reference_error() {
        let err = run_simple("nonexistentVar.foo()").await.unwrap_err();
        let msg = err.to_string();
        assert!(
            msg.contains("not defined") || msg.contains("nonexistentVar"),
            "expected reference error in: {msg}"
        );
    }

    #[tokio::test]
    async fn console_output_preserved_on_error() {
        let err = run_simple(
            r#"
            console.log("before crash");
            throw new Error("boom");
            "#,
        )
        .await
        .unwrap_err();

        let msg = err.to_string();
        assert!(msg.contains("before crash"), "expected console in: {msg}");
        assert!(msg.contains("boom"), "expected error in: {msg}");
    }

    #[tokio::test]
    async fn multiple_tool_calls_sequentially() {
        let result = run_with_tool(
            r#"
            const a = echo({msg: "first"});
            const b = echo({msg: "second"});
            ({a: a.echoed, b: b.echoed})
            "#,
            echo_tool(),
            |_tool_id, input| Ok(json!({"echoed": input["msg"]})),
        )
        .await
        .unwrap();

        assert_eq!(result.value["a"], "first");
        assert_eq!(result.value["b"], "second");
    }

    #[tokio::test]
    async fn returns_object_value() {
        let result = run_simple(r#"({key: "value", num: 42})"#).await.unwrap();
        assert_eq!(result.value["key"], "value");
        assert_eq!(result.value["num"], 42);
    }

    #[tokio::test]
    async fn returns_null_for_undefined() {
        let result = run_simple("undefined").await.unwrap();
        assert_eq!(result.value, Value::Null);
    }

    #[tokio::test]
    async fn returns_string_value() {
        let result = run_simple(r#""hello""#).await.unwrap();
        assert_eq!(result.value, json!("hello"));
    }

    #[tokio::test]
    async fn console_log_with_objects() {
        let result = run_simple(
            r#"
            console.log("obj:", {a: 1, b: "two"});
            console.log(null, undefined, 42, true);
            "done"
            "#,
        )
        .await
        .unwrap();

        assert_eq!(result.console_output.len(), 2);
        assert_eq!(result.console_output[0], r#"obj: {"a":1,"b":"two"}"#);
        assert_eq!(result.console_output[1], "null undefined 42 true");
    }

    #[tokio::test]
    async fn tool_result_used_in_console_log() {
        let result = run_with_tool(
            r#"
            const data = echo({msg: "hi"});
            console.log("result:", data);
            data
            "#,
            echo_tool(),
            |_tool_id, input| Ok(json!({"echoed": input["msg"]})),
        )
        .await
        .unwrap();

        assert!(result.console_output[0].contains("echoed"));
        assert!(result.console_output[0].contains("hi"));
    }

    // ── Structured error tests ──────────────────────────────────────

    #[tokio::test]
    async fn structured_error_properties_accessible_in_js() {
        let result = run_with_tool(
            r#"
            try {
                echo({msg: "fail"});
            } catch (e) {
                ({message: e.message, stdout: e.stdout, exit_code: e.exit_code});
            }
            "#,
            echo_tool(),
            |_tool_id, _input| {
                Err(EngineError::tool_error(
                    "command failed",
                    json!({"stdout": "some output", "exit_code": 1}),
                ))
            },
        )
        .await
        .unwrap();

        assert_eq!(result.value["message"], "command failed");
        assert_eq!(result.value["stdout"], "some output");
        assert_eq!(result.value["exit_code"], 1);
    }

    #[tokio::test]
    async fn plain_tool_invocation_error_still_works() {
        let result = run_with_tool(
            r#"
            try {
                echo({msg: "fail"});
            } catch (e) {
                ({caught: e.message});
            }
            "#,
            echo_tool(),
            |_tool_id, _input| Err(EngineError::ToolInvocation("plain error".into())),
        )
        .await
        .unwrap();

        let caught = result.value["caught"].as_str().unwrap();
        assert!(caught.contains("plain error"), "expected 'plain error' in: {caught}");
    }

    #[tokio::test]
    async fn structured_error_with_nested_data() {
        let result = run_with_tool(
            r#"
            try {
                echo({msg: "fail"});
            } catch (e) {
                ({
                    message: e.message,
                    details_name: e.details.name,
                    tags_count: e.tags.length,
                    tags_first: e.tags[0],
                });
            }
            "#,
            echo_tool(),
            |_tool_id, _input| {
                Err(EngineError::tool_error(
                    "nested fail",
                    json!({
                        "details": {"name": "inner"},
                        "tags": ["a", "b", "c"],
                    }),
                ))
            },
        )
        .await
        .unwrap();

        assert_eq!(result.value["message"], "nested fail");
        assert_eq!(result.value["details_name"], "inner");
        assert_eq!(result.value["tags_count"], 3);
        assert_eq!(result.value["tags_first"], "a");
    }

    #[tokio::test]
    async fn uncaught_structured_error_includes_message() {
        let err = run_with_tool(
            r#"echo({msg: "fail"})"#,
            echo_tool(),
            |_tool_id, _input| {
                Err(EngineError::tool_error(
                    "structured boom",
                    json!({"code": 42}),
                ))
            },
        )
        .await
        .unwrap_err();

        let msg = err.to_string();
        assert!(
            msg.contains("structured boom"),
            "expected 'structured boom' in: {msg}"
        );
    }

    // ── Positional argument tests ───────────────────────────────────

    fn multi_param_tool() -> ToolDescriptor {
        ToolDescriptor {
            id: "write_file".into(),
            description: "Write a file".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string" },
                    "content": { "type": "string" }
                },
                "required": ["path", "content"]
            }),
            output_schema: None,
        }
    }

    #[tokio::test]
    async fn positional_args_work() {
        let result = run_with_tool(
            r#"write_file("hello.txt", "world")"#,
            multi_param_tool(),
            |_tool_id, input| {
                Ok(json!({
                    "received_path": input["path"],
                    "received_content": input["content"],
                }))
            },
        )
        .await
        .unwrap();

        assert_eq!(result.value["received_path"], "hello.txt");
        assert_eq!(result.value["received_content"], "world");
    }

    #[tokio::test]
    async fn object_arg_still_works() {
        let result = run_with_tool(
            r#"write_file({path: "hello.txt", content: "world"})"#,
            multi_param_tool(),
            |_tool_id, input| {
                Ok(json!({
                    "received_path": input["path"],
                    "received_content": input["content"],
                }))
            },
        )
        .await
        .unwrap();

        assert_eq!(result.value["received_path"], "hello.txt");
        assert_eq!(result.value["received_content"], "world");
    }

    #[tokio::test]
    async fn no_param_tool_works_without_args() {
        let no_param_tool = ToolDescriptor {
            id: "get_time".into(),
            description: "Get time".into(),
            input_schema: json!({"type": "object", "properties": {}}),
            output_schema: None,
        };

        let result = run_with_tool(
            r#"get_time()"#,
            no_param_tool,
            |_tool_id, _input| Ok(json!({"ts": 12345})),
        )
        .await
        .unwrap();

        assert_eq!(result.value["ts"], 12345);
    }

    #[test]
    fn extract_param_names_ordering() {
        let schema = json!({
            "type": "object",
            "properties": {
                "z_optional": { "type": "string" },
                "path": { "type": "string" },
                "content": { "type": "string" },
                "a_optional": { "type": "number" }
            },
            "required": ["path", "content"]
        });
        let names = extract_param_names(&schema);
        assert_eq!(names, vec!["path", "content", "a_optional", "z_optional"]);
    }

    #[test]
    fn extract_param_names_empty_properties() {
        let schema = json!({"type": "object", "properties": {}});
        assert!(extract_param_names(&schema).is_empty());
    }

    #[test]
    fn extract_param_names_no_properties() {
        let schema = json!({"type": "object"});
        assert!(extract_param_names(&schema).is_empty());
    }

    #[tokio::test]
    async fn date_now_returns_value_from_bridge() {
        let result = run_simple("Date.now()").await.unwrap();
        assert_eq!(result.value.as_f64().unwrap(), 1709568000000.0);
    }

    #[tokio::test]
    async fn math_random_returns_value_from_bridge() {
        let result = run_simple("Math.random()").await.unwrap();
        assert_eq!(result.value, json!(0.5));
    }

    #[tokio::test]
    async fn interrupt_flag_halts_execution() {
        let sandbox = QuickJsSandbox::new();
        let (tx, mut rx) = mpsc::channel::<SandboxRequest>(32);
        let interrupt = Arc::new(AtomicBool::new(false));
        let int_clone = interrupt.clone();

        let handle = tokio::spawn(async move {
            // Infinite loop — should be interrupted.
            sandbox
                .execute("while(true) {}", &[], tx, int_clone)
                .await
        });

        // Give the sandbox a moment to start, then interrupt.
        tokio::task::yield_now().await;
        interrupt.store(true, Ordering::Release);

        // Drain any pending requests.
        while rx.try_recv().is_ok() {}

        let result = handle.await.unwrap();
        assert!(result.is_err());
        let msg = result.unwrap_err().to_string();
        assert!(
            msg.contains("interrupted") || msg.contains("Interrupted"),
            "expected interrupt error in: {msg}"
        );
    }

    #[tokio::test]
    async fn interrupt_is_not_catchable_by_js_try_catch() {
        let sandbox = QuickJsSandbox::new();
        let (tx, _rx) = mpsc::channel::<SandboxRequest>(32);
        let interrupt = Arc::new(AtomicBool::new(true)); // pre-set

        let result = sandbox
            .execute("try { while(true) {} } catch(e) { 'caught' }", &[], tx, interrupt)
            .await;

        assert!(result.is_err());
    }
}
