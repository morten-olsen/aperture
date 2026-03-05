use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::tool::{ToolContext, ToolInvoke};

use crate::config::RuntimeConfig;
use crate::workspace::resolve_sandboxed_path;

fn get_config<'a>(ctx: &'a ToolContext<'a>) -> Result<&'a RuntimeConfig> {
    ctx.extensions.get::<RuntimeConfig>().ok_or_else(|| {
        EngineError::ToolInvocation("RuntimeConfig not found in extensions".into())
    })
}

fn get_path_param(input: &Value, key: &str) -> Result<String> {
    input
        .get(key)
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| EngineError::ToolInvocation(format!("missing required field: {key}")))
}

// ── fs_read ─────────────────────────────────────────────────────────

pub struct FsRead;

#[async_trait]
impl ToolInvoke for FsRead {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rel_path = get_path_param(&ctx.input, "path")?;
        let path = resolve_sandboxed_path(config, &ctx.user_id, &rel_path)?;

        let content = tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to read file: {e}")))?;

        Ok(json!({ "content": content }))
    }
}

// ── fs_write ────────────────────────────────────────────────────────

pub struct FsWrite;

#[async_trait]
impl ToolInvoke for FsWrite {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rel_path = get_path_param(&ctx.input, "path")?;
        let content = get_path_param(&ctx.input, "content")?;
        let path = resolve_sandboxed_path(config, &ctx.user_id, &rel_path)?;

        // Create parent directories if needed.
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| EngineError::ToolInvocation(format!("failed to create directory: {e}")))?;
        }

        tokio::fs::write(&path, content.as_bytes())
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to write file: {e}")))?;

        Ok(json!({}))
    }
}

// ── fs_list ─────────────────────────────────────────────────────────

pub struct FsList;

#[async_trait]
impl ToolInvoke for FsList {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rel_path = ctx
            .input
            .get("path")
            .and_then(|v| v.as_str())
            .unwrap_or(".");
        let path = resolve_sandboxed_path(config, &ctx.user_id, rel_path)?;

        let mut entries = Vec::new();
        let mut dir = tokio::fs::read_dir(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to read directory: {e}")))?;

        while let Some(entry) = dir.next_entry().await.map_err(|e| {
            EngineError::ToolInvocation(format!("failed to read entry: {e}"))
        })? {
            let file_type = entry.file_type().await.map_err(|e| {
                EngineError::ToolInvocation(format!("failed to get file type: {e}"))
            })?;

            let entry_type = if file_type.is_dir() {
                "directory"
            } else if file_type.is_symlink() {
                "symlink"
            } else {
                "file"
            };

            entries.push(json!({
                "name": entry.file_name().to_string_lossy(),
                "type": entry_type,
            }));
        }

        Ok(json!({ "entries": entries }))
    }
}

// ── fs_mkdir ────────────────────────────────────────────────────────

pub struct FsMkdir;

#[async_trait]
impl ToolInvoke for FsMkdir {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rel_path = get_path_param(&ctx.input, "path")?;
        let path = resolve_sandboxed_path(config, &ctx.user_id, &rel_path)?;

        tokio::fs::create_dir_all(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to create directory: {e}")))?;

        Ok(json!({}))
    }
}

// ── fs_remove ───────────────────────────────────────────────────────

pub struct FsRemove;

#[async_trait]
impl ToolInvoke for FsRemove {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rel_path = get_path_param(&ctx.input, "path")?;
        let path = resolve_sandboxed_path(config, &ctx.user_id, &rel_path)?;

        let meta = tokio::fs::metadata(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("path not found: {e}")))?;

        if meta.is_dir() {
            tokio::fs::remove_dir_all(&path)
                .await
                .map_err(|e| EngineError::ToolInvocation(format!("failed to remove directory: {e}")))?;
        } else {
            tokio::fs::remove_file(&path)
                .await
                .map_err(|e| EngineError::ToolInvocation(format!("failed to remove file: {e}")))?;
        }

        Ok(json!({}))
    }
}

// ── fs_move ─────────────────────────────────────────────────────────

pub struct FsMove;

#[async_trait]
impl ToolInvoke for FsMove {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let from = get_path_param(&ctx.input, "from")?;
        let to = get_path_param(&ctx.input, "to")?;
        let from_path = resolve_sandboxed_path(config, &ctx.user_id, &from)?;
        let to_path = resolve_sandboxed_path(config, &ctx.user_id, &to)?;

        // Create parent directories for the destination if needed.
        if let Some(parent) = to_path.parent() {
            tokio::fs::create_dir_all(parent)
                .await
                .map_err(|e| EngineError::ToolInvocation(format!("failed to create directory: {e}")))?;
        }

        tokio::fs::rename(&from_path, &to_path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to move: {e}")))?;

        Ok(json!({}))
    }
}

// ── fs_info ─────────────────────────────────────────────────────────

pub struct FsInfo;

#[async_trait]
impl ToolInvoke for FsInfo {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = get_config(&ctx)?;
        let rel_path = get_path_param(&ctx.input, "path")?;
        let path = resolve_sandboxed_path(config, &ctx.user_id, &rel_path)?;

        let meta = tokio::fs::metadata(&path)
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("path not found: {e}")))?;

        let file_type = if meta.is_dir() {
            "directory"
        } else if meta.is_symlink() {
            "symlink"
        } else {
            "file"
        };

        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());

        Ok(json!({
            "size": meta.len(),
            "modified": modified,
            "type": file_type,
        }))
    }
}
