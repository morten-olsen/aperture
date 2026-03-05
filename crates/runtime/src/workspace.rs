use std::path::{Component, Path, PathBuf};

use aperture_engine::error::EngineError;

use crate::config::RuntimeConfig;

/// Resolve a relative path within the user's workspace, preventing escapes.
///
/// - Rejects absolute paths and `..` components.
/// - Canonicalizes both the workspace root and target to prevent symlink escapes.
/// - For non-existent targets, canonicalizes the nearest existing ancestor.
pub fn resolve_sandboxed_path(
    config: &RuntimeConfig,
    user_id: &str,
    relative_path: &str,
) -> Result<PathBuf, EngineError> {
    let workspace = config.workspace_dir(user_id);

    // Reject absolute paths.
    let rel = Path::new(relative_path);
    if rel.is_absolute() {
        return Err(EngineError::ToolInvocation(
            "absolute paths are not allowed; use a path relative to the workspace".into(),
        ));
    }

    // Reject `..` components.
    for component in rel.components() {
        if matches!(component, Component::ParentDir) {
            return Err(EngineError::ToolInvocation(
                "path traversal with '..' is not allowed".into(),
            ));
        }
    }

    let target = workspace.join(relative_path);

    // Ensure the workspace directory exists.
    if !workspace.exists() {
        std::fs::create_dir_all(&workspace).map_err(|e| {
            EngineError::ToolInvocation(format!("failed to create workspace directory: {e}"))
        })?;
    }

    // Canonicalize the workspace root.
    let canonical_workspace = workspace.canonicalize().map_err(|e| {
        EngineError::ToolInvocation(format!("workspace directory is inaccessible: {e}"))
    })?;

    // For existing paths, canonicalize directly.
    if target.exists() {
        let canonical_target = target
            .canonicalize()
            .map_err(|e| EngineError::ToolInvocation(format!("failed to resolve path: {e}")))?;

        if !canonical_target.starts_with(&canonical_workspace) {
            return Err(EngineError::ToolInvocation(
                "path resolves outside the workspace".into(),
            ));
        }

        return Ok(canonical_target);
    }

    // For non-existent paths, canonicalize the nearest existing ancestor
    // and append the remaining components.
    let mut ancestor = target.clone();
    let mut remaining = Vec::new();

    loop {
        if ancestor.exists() {
            break;
        }
        if let Some(file_name) = ancestor.file_name() {
            remaining.push(file_name.to_os_string());
            ancestor = ancestor
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or(workspace.clone());
        } else {
            break;
        }
    }

    let canonical_ancestor = ancestor
        .canonicalize()
        .map_err(|e| EngineError::ToolInvocation(format!("failed to resolve parent path: {e}")))?;

    if !canonical_ancestor.starts_with(&canonical_workspace) {
        return Err(EngineError::ToolInvocation(
            "path resolves outside the workspace".into(),
        ));
    }

    // Rebuild the full path from the canonical ancestor.
    let mut result = canonical_ancestor;
    for part in remaining.into_iter().rev() {
        result = result.join(part);
    }

    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn test_config(tmp: &Path) -> RuntimeConfig {
        RuntimeConfig {
            data_root: tmp.to_path_buf(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
        }
    }

    #[test]
    fn resolves_simple_path() {
        let tmp = std::env::temp_dir().join("aperture-ws-test-simple");
        let workspace = tmp.join("user1").join("workspace");
        fs::create_dir_all(&workspace).unwrap();
        fs::write(workspace.join("hello.txt"), "hi").unwrap();

        let config = test_config(&tmp);
        let result = resolve_sandboxed_path(&config, "user1", "hello.txt").unwrap();
        assert!(result.ends_with("hello.txt"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn rejects_absolute_path() {
        let tmp = std::env::temp_dir().join("aperture-ws-test-abs");
        let workspace = tmp.join("user1").join("workspace");
        fs::create_dir_all(&workspace).unwrap();

        let config = test_config(&tmp);
        let err = resolve_sandboxed_path(&config, "user1", "/etc/passwd").unwrap_err();
        assert!(err.to_string().contains("absolute paths"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn rejects_parent_traversal() {
        let tmp = std::env::temp_dir().join("aperture-ws-test-parent");
        let workspace = tmp.join("user1").join("workspace");
        fs::create_dir_all(&workspace).unwrap();

        let config = test_config(&tmp);
        let err = resolve_sandboxed_path(&config, "user1", "../../../etc/passwd").unwrap_err();
        assert!(err.to_string().contains(".."));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn allows_nonexistent_path_within_workspace() {
        let tmp = std::env::temp_dir().join("aperture-ws-test-nonexist");
        let workspace = tmp.join("user1").join("workspace");
        fs::create_dir_all(&workspace).unwrap();

        let config = test_config(&tmp);
        let result = resolve_sandboxed_path(&config, "user1", "new-file.txt").unwrap();
        assert!(result.to_string_lossy().contains("new-file.txt"));

        let _ = fs::remove_dir_all(&tmp);
    }

    #[test]
    fn allows_nested_nonexistent_path() {
        let tmp = std::env::temp_dir().join("aperture-ws-test-nested");
        let workspace = tmp.join("user1").join("workspace");
        fs::create_dir_all(&workspace).unwrap();

        let config = test_config(&tmp);
        let result = resolve_sandboxed_path(&config, "user1", "subdir/file.txt").unwrap();
        assert!(result.to_string_lossy().contains("subdir"));
        assert!(result.to_string_lossy().contains("file.txt"));

        let _ = fs::remove_dir_all(&tmp);
    }
}
