use async_trait::async_trait;
use serde_json::json;

use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext};
use aperture_engine::tool::Tool;

use crate::fs_tools::*;

pub struct FilesystemPlugin;

#[async_trait]
impl Plugin for FilesystemPlugin {
    fn id(&self) -> &str {
        "filesystem"
    }

    fn description(&self) -> &str {
        "Provides sandboxed filesystem access within the user's workspace"
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        ctx.tools.push(Tool {
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
            invoke: Box::new(FsRead),
        });

        ctx.tools.push(Tool {
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
            invoke: Box::new(FsWrite),
        });

        ctx.tools.push(Tool {
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
            invoke: Box::new(FsList),
        });

        ctx.tools.push(Tool {
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
            invoke: Box::new(FsMkdir),
        });

        ctx.tools.push(Tool {
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
            invoke: Box::new(FsRemove),
        });

        ctx.tools.push(Tool {
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
            invoke: Box::new(FsMove),
        });

        ctx.tools.push(Tool {
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
            invoke: Box::new(FsInfo),
        });

        Ok(())
    }
}
