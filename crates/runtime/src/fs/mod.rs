use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext, SetupContext};
use aperture_engine::tool::Tool;

mod tools;

use self::tools::*;

pub struct FilesystemPlugin;

const FS_TOOL_IDS: &[&str] = &[
    "fs_read",
    "fs_write",
    "fs_list",
    "fs_mkdir",
    "fs_remove",
    "fs_move",
    "fs_info",
];

#[async_trait]
impl Plugin for FilesystemPlugin {
    fn id(&self) -> &str {
        "filesystem"
    }

    fn description(&self) -> &str {
        "Provides sandboxed filesystem access within the user's workspace"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        ctx.registry.register(Tool {
            id: "fs_read".into(),
            description: "Read the contents of a file in the workspace.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path within the workspace" }
                },
                "required": ["path"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(FsRead),
        });

        ctx.registry.register(Tool {
            id: "fs_write".into(),
            description: "Write content to a file in the workspace. Creates parent directories if needed.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path within the workspace" },
                    "content": { "type": "string", "description": "Content to write" }
                },
                "required": ["path", "content"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(FsWrite),
        });

        ctx.registry.register(Tool {
            id: "fs_list".into(),
            description: "List entries in a directory within the workspace.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path (defaults to workspace root)" }
                }
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(FsList),
        });

        ctx.registry.register(Tool {
            id: "fs_mkdir".into(),
            description: "Create a directory (and parents) within the workspace.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path within the workspace" }
                },
                "required": ["path"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(FsMkdir),
        });

        ctx.registry.register(Tool {
            id: "fs_remove".into(),
            description: "Remove a file or directory within the workspace.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path within the workspace" }
                },
                "required": ["path"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(FsRemove),
        });

        ctx.registry.register(Tool {
            id: "fs_move".into(),
            description: "Move or rename a file or directory within the workspace.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "from": { "type": "string", "description": "Source relative path" },
                    "to": { "type": "string", "description": "Destination relative path" }
                },
                "required": ["from", "to"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(FsMove),
        });

        ctx.registry.register(Tool {
            id: "fs_info".into(),
            description: "Get metadata about a file or directory (size, modified time, type).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "path": { "type": "string", "description": "Relative path within the workspace" }
                },
                "required": ["path"]
            }),
            output_schema: None,
            require_approval: None,
            invoke: Arc::new(FsInfo),
        });

        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        for id in FS_TOOL_IDS {
            ctx.activate_tool(id)?;
        }
        Ok(())
    }
}
