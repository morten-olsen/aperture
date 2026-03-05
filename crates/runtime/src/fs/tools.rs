use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::tool::{ToolContext, ToolInvoke};

use crate::config::RuntimeConfig;
use crate::validation::{self, FileValidationService};
use crate::workspace::resolve_sandboxed_path;

fn get_config<'a>(ctx: &'a ToolContext<'a>) -> Result<&'a RuntimeConfig> {
    ctx.extensions
        .get::<RuntimeConfig>()
        .ok_or_else(|| EngineError::ToolInvocation("RuntimeConfig not found in extensions".into()))
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
        let validation_service = ctx.extensions.get::<FileValidationService>();

        validation::validated_write(
            config,
            &ctx.user_id,
            &rel_path,
            &content,
            validation_service,
        )
        .await?;

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

        while let Some(entry) = dir
            .next_entry()
            .await
            .map_err(|e| EngineError::ToolInvocation(format!("failed to read entry: {e}")))?
        {
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
            tokio::fs::remove_dir_all(&path).await.map_err(|e| {
                EngineError::ToolInvocation(format!("failed to remove directory: {e}"))
            })?;
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
            tokio::fs::create_dir_all(parent).await.map_err(|e| {
                EngineError::ToolInvocation(format!("failed to create directory: {e}"))
            })?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;

    fn test_setup() -> (PathBuf, Extensions) {
        let tmp = std::env::temp_dir().join(format!("aperture-fs-test-{}", uuid::Uuid::new_v4()));
        let ws = tmp.join("testuser").join("workspace");
        std::fs::create_dir_all(&ws).unwrap();
        let config = RuntimeConfig {
            data_root: tmp.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let mut ext = Extensions::new();
        ext.insert(config);
        (tmp, ext)
    }

    fn make_ctx<'a>(
        input: Value,
        state: &'a mut State,
        extensions: &'a Extensions,
        events: &'a EventBus,
    ) -> ToolContext<'a> {
        ToolContext {
            input,
            state,
            extensions,
            events,
            user_id: "testuser".into(),
            replay: None,
        }
    }

    #[tokio::test]
    async fn fs_write_creates_file() {
        let (tmp, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();

        let ctx = make_ctx(
            json!({"path": "test.txt", "content": "hello"}),
            &mut state,
            &ext,
            &events,
        );
        FsWrite.invoke(ctx).await.unwrap();

        let ws = tmp.join("testuser").join("workspace");
        let content = std::fs::read_to_string(ws.join("test.txt")).unwrap();
        assert_eq!(content, "hello");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn fs_read_returns_content() {
        let (tmp, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();

        let ws = tmp.join("testuser").join("workspace");
        std::fs::write(ws.join("read-me.txt"), "world").unwrap();

        let ctx = make_ctx(json!({"path": "read-me.txt"}), &mut state, &ext, &events);
        let result = FsRead.invoke(ctx).await.unwrap();
        assert_eq!(result["content"], "world");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn fs_list_returns_entries() {
        let (tmp, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();

        let ws = tmp.join("testuser").join("workspace");
        std::fs::write(ws.join("file.txt"), "data").unwrap();
        std::fs::create_dir_all(ws.join("subdir")).unwrap();

        let ctx = make_ctx(json!({"path": "."}), &mut state, &ext, &events);
        let result = FsList.invoke(ctx).await.unwrap();

        let entries = result["entries"].as_array().unwrap();
        assert_eq!(entries.len(), 2);

        let names: Vec<&str> = entries
            .iter()
            .map(|e| e["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"file.txt"));
        assert!(names.contains(&"subdir"));

        let subdir_entry = entries.iter().find(|e| e["name"] == "subdir").unwrap();
        assert_eq!(subdir_entry["type"], "directory");

        let file_entry = entries.iter().find(|e| e["name"] == "file.txt").unwrap();
        assert_eq!(file_entry["type"], "file");

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn fs_mkdir_creates_directory() {
        let (tmp, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();

        let ctx = make_ctx(json!({"path": "newdir"}), &mut state, &ext, &events);
        FsMkdir.invoke(ctx).await.unwrap();

        let ws = tmp.join("testuser").join("workspace");
        assert!(ws.join("newdir").is_dir());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn fs_remove_deletes_file() {
        let (tmp, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();

        let ws = tmp.join("testuser").join("workspace");
        std::fs::write(ws.join("doomed.txt"), "bye").unwrap();
        assert!(ws.join("doomed.txt").exists());

        let ctx = make_ctx(json!({"path": "doomed.txt"}), &mut state, &ext, &events);
        FsRemove.invoke(ctx).await.unwrap();

        assert!(!ws.join("doomed.txt").exists());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn fs_move_renames_file() {
        let (tmp, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();

        let ws = tmp.join("testuser").join("workspace");
        std::fs::write(ws.join("a.txt"), "content").unwrap();

        let ctx = make_ctx(
            json!({"from": "a.txt", "to": "b.txt"}),
            &mut state,
            &ext,
            &events,
        );
        FsMove.invoke(ctx).await.unwrap();

        assert!(!ws.join("a.txt").exists());
        assert_eq!(
            std::fs::read_to_string(ws.join("b.txt")).unwrap(),
            "content"
        );

        let _ = std::fs::remove_dir_all(&tmp);
    }

    #[tokio::test]
    async fn fs_info_returns_metadata() {
        let (tmp, ext) = test_setup();
        let mut state = State::new();
        let events = EventBus::new();

        let ws = tmp.join("testuser").join("workspace");
        std::fs::write(ws.join("info.txt"), "12345").unwrap();

        let ctx = make_ctx(json!({"path": "info.txt"}), &mut state, &ext, &events);
        let result = FsInfo.invoke(ctx).await.unwrap();

        assert_eq!(result["type"], "file");
        assert_eq!(result["size"], 5);
        assert!(result.get("modified").is_some());

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
