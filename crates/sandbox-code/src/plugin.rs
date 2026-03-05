use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use aperture_engine::context::ContextItem;
use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext};
use aperture_engine::sandbox::ToolDescriptor;
use aperture_engine::tool::Tool;

use crate::inspect::InspectToolInvoke;
use crate::listing::generate_listing;
use crate::quickjs::CodeSandbox;
use crate::run_code::{RunCodeInvoke, RunScriptInvoke};

/// Plugin that replaces all registered tools with a code sandbox.
///
/// Must be registered **last** so it sees tools from all prior plugins.
/// During `prepare`, it drains all existing tools and exposes them as
/// callable functions inside a QuickJS sandbox. The LLM sees only three
/// tools: `run_code`, `run_script`, and `inspect_tool`.
pub struct SandboxPlugin {
    sandbox: Arc<dyn CodeSandbox>,
}

impl SandboxPlugin {
    pub fn new(sandbox: Arc<dyn CodeSandbox>) -> Self {
        Self { sandbox }
    }
}

#[async_trait]
impl Plugin for SandboxPlugin {
    fn id(&self) -> &str {
        "sandbox"
    }

    fn name(&self) -> &str {
        "Code Sandbox"
    }

    fn description(&self) -> &str {
        "Replaces tool-calling with a JavaScript code sandbox"
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        // Build descriptors from the currently active tools (registered by prior plugins).
        let descriptors: Vec<ToolDescriptor> = ctx.tools.iter().map(Into::into).collect();

        // Clone active tools from the registry (so the registry retains ownership).
        let inner_tools: Vec<Tool> = ctx
            .tools
            .iter()
            .filter_map(|t| ctx.registry.get(&t.id).cloned())
            .collect();
        let inner_tools: Arc<Vec<Tool>> = Arc::new(inner_tools);

        // Clear the active tools — replaced by sandbox tools.
        ctx.tools.clear();

        // Generate the human-readable function listing.
        let listing = generate_listing(&descriptors);

        // Push the run_code tool (carries the cloned inner tools).
        ctx.tools.push(Tool {
            id: "run_code".into(),
            description: "Execute JavaScript code in a sandbox. Tool functions are available \
                          as global functions. Returns the script's return value and any \
                          console.log output."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "code": {
                        "type": "string",
                        "description": "JavaScript code to execute"
                    }
                },
                "required": ["code"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "value": { "description": "Return value of the script" },
                    "console_output": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Lines captured from console.log"
                    }
                }
            })),
            require_approval: None,
            invoke: Arc::new(RunCodeInvoke {
                sandbox: self.sandbox.clone(),
                tools: inner_tools.clone(),
            }),
        });

        // Push the run_script tool.
        ctx.tools.push(Tool {
            id: "run_script".into(),
            description: "Execute a JavaScript file from the workspace. If the script is \
                          pre-approved in script-rules, inner tool calls skip approval gates."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Workspace-relative path to the .js file"
                    }
                },
                "required": ["path"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "value": { "description": "Return value of the script" },
                    "console_output": {
                        "type": "array",
                        "items": { "type": "string" },
                        "description": "Lines captured from console.log"
                    }
                }
            })),
            require_approval: None,
            invoke: Arc::new(RunScriptInvoke {
                sandbox: self.sandbox.clone(),
                tools: inner_tools,
            }),
        });

        // Push the inspect_tool tool (lightweight descriptors only).
        ctx.tools.push(Tool {
            id: "inspect_tool".into(),
            description: "Get the full JSON schema for a sandbox function. Use this to understand \
                 a function's parameters before calling it."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "tool_id": {
                        "type": "string",
                        "description": "The function name to inspect"
                    }
                },
                "required": ["tool_id"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(InspectToolInvoke {
                descriptors: descriptors.clone(),
            }),
        });

        // Inject context telling the LLM what functions are available.
        ctx.context.push(ContextItem {
            item_type: "text".into(),
            id: Some("sandbox-functions".into()),
            content: format!(
                "{listing}\n\n\
                 You also have `run_script({{path}})` to execute .js files from the workspace. \
                 Pre-approved scripts (via `script_rules_add`) bypass inner approval gates."
            ),
        });

        Ok(())
    }
}
