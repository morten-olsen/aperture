use serde::{Deserialize, Serialize};

/// A single script approval entry: path + SHA-256 checksum.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptAllowEntry {
    pub path: String,
    pub sha256: String,
}

/// Script rules file, deserialized from TOML.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ScriptRulesFile {
    #[serde(default)]
    pub allow: Vec<ScriptAllowEntry>,
}

/// Check if a script at `script_path` with the given `sha256` hash is approved.
pub fn check_script(rules: &ScriptRulesFile, script_path: &str, sha256: &str) -> bool {
    rules
        .allow
        .iter()
        .any(|entry| entry.path == script_path && entry.sha256 == sha256)
}

/// Load script rules from a TOML file. Returns default (empty) if file doesn't exist.
pub fn load_script_rules(path: &std::path::Path) -> Result<ScriptRulesFile, String> {
    if !path.exists() {
        return Ok(ScriptRulesFile::default());
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("failed to read script-rules.toml: {e}"))?;

    toml::from_str(&content).map_err(|e| format!("failed to parse script-rules.toml: {e}"))
}

/// Save script rules to a TOML file.
pub fn save_script_rules(path: &std::path::Path, rules: &ScriptRulesFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create configs directory: {e}"))?;
    }

    let content = toml::to_string_pretty(rules)
        .map_err(|e| format!("failed to serialize script rules: {e}"))?;

    std::fs::write(path, content).map_err(|e| format!("failed to write script-rules.toml: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn toml_round_trip() {
        let rules = ScriptRulesFile {
            allow: vec![ScriptAllowEntry {
                path: "scripts/deploy.js".into(),
                sha256: "abc123".into(),
            }],
        };

        let toml_str = toml::to_string_pretty(&rules).unwrap();
        let parsed: ScriptRulesFile = toml::from_str(&toml_str).unwrap();

        assert_eq!(parsed.allow.len(), 1);
        assert_eq!(parsed.allow[0].path, "scripts/deploy.js");
        assert_eq!(parsed.allow[0].sha256, "abc123");
    }

    #[test]
    fn check_script_matching() {
        let rules = ScriptRulesFile {
            allow: vec![ScriptAllowEntry {
                path: "scripts/deploy.js".into(),
                sha256: "abc123".into(),
            }],
        };

        assert!(check_script(&rules, "scripts/deploy.js", "abc123"));
    }

    #[test]
    fn check_script_hash_mismatch() {
        let rules = ScriptRulesFile {
            allow: vec![ScriptAllowEntry {
                path: "scripts/deploy.js".into(),
                sha256: "abc123".into(),
            }],
        };

        assert!(!check_script(&rules, "scripts/deploy.js", "different_hash"));
    }

    #[test]
    fn check_script_path_mismatch() {
        let rules = ScriptRulesFile {
            allow: vec![ScriptAllowEntry {
                path: "scripts/deploy.js".into(),
                sha256: "abc123".into(),
            }],
        };

        assert!(!check_script(&rules, "scripts/other.js", "abc123"));
    }

    #[test]
    fn empty_rules_returns_false() {
        let rules = ScriptRulesFile::default();
        assert!(!check_script(&rules, "any.js", "any_hash"));
    }

    #[test]
    fn load_nonexistent_returns_default() {
        let path = std::path::Path::new("/tmp/aperture-nonexistent-script-rules.toml");
        let rules = load_script_rules(path).unwrap();
        assert!(rules.allow.is_empty());
    }

    #[test]
    fn save_and_load_round_trip() {
        let tmp = std::env::temp_dir().join("aperture-script-rules-test");
        std::fs::create_dir_all(&tmp).unwrap();
        let path = tmp.join("script-rules.toml");

        let rules = ScriptRulesFile {
            allow: vec![
                ScriptAllowEntry {
                    path: "a.js".into(),
                    sha256: "hash_a".into(),
                },
                ScriptAllowEntry {
                    path: "b.js".into(),
                    sha256: "hash_b".into(),
                },
            ],
        };

        save_script_rules(&path, &rules).unwrap();
        let loaded = load_script_rules(&path).unwrap();

        assert_eq!(loaded.allow.len(), 2);
        assert_eq!(loaded.allow[0].path, "a.js");
        assert_eq!(loaded.allow[1].sha256, "hash_b");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
