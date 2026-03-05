use serde::{Deserialize, Serialize};

/// A single deny rule: commands matching this pattern are rejected.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DenyEntry {
    pub pattern: String,
}

/// A single allow rule: commands matching this pattern are permitted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllowEntry {
    pub pattern: String,
    #[serde(default)]
    pub network: bool,
}

/// CLI rules file, deserialized from TOML.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CliRulesFile {
    #[serde(default)]
    pub allow: Vec<AllowEntry>,
    #[serde(default)]
    pub deny: Vec<DenyEntry>,
}

/// Result of checking a command against the rules.
#[derive(Debug, Clone, PartialEq)]
pub enum CommandCheck {
    /// Command matches an allow rule.
    Allowed { network: bool },
    /// Command matches a deny rule.
    Denied { pattern: String },
    /// Command matches no rule.
    Unmatched,
}

/// Check a command against CLI rules. Deny rules are evaluated first.
pub fn check_command(rules: &CliRulesFile, command: &str) -> CommandCheck {
    // Deny rules first.
    for deny in &rules.deny {
        if glob_match::glob_match(&deny.pattern, command) {
            return CommandCheck::Denied {
                pattern: deny.pattern.clone(),
            };
        }
    }

    // Allow rules second.
    for allow in &rules.allow {
        if glob_match::glob_match(&allow.pattern, command) {
            return CommandCheck::Allowed {
                network: allow.network,
            };
        }
    }

    CommandCheck::Unmatched
}

/// Load CLI rules from a TOML file. Returns default (empty) if file doesn't exist.
pub fn load_rules(path: &std::path::Path) -> Result<CliRulesFile, String> {
    if !path.exists() {
        return Ok(CliRulesFile::default());
    }

    let content =
        std::fs::read_to_string(path).map_err(|e| format!("failed to read cli-rules.toml: {e}"))?;

    toml::from_str(&content).map_err(|e| format!("failed to parse cli-rules.toml: {e}"))
}

/// Save CLI rules to a TOML file.
pub fn save_rules(path: &std::path::Path, rules: &CliRulesFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create configs directory: {e}"))?;
    }

    let content =
        toml::to_string_pretty(rules).map_err(|e| format!("failed to serialize rules: {e}"))?;

    std::fs::write(path, content).map_err(|e| format!("failed to write cli-rules.toml: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_rules() -> CliRulesFile {
        CliRulesFile {
            deny: vec![DenyEntry {
                pattern: "rm -rf *".into(),
            }],
            allow: vec![
                AllowEntry {
                    pattern: "cargo build *".into(),
                    network: true,
                },
                AllowEntry {
                    pattern: "ls *".into(),
                    network: false,
                },
            ],
        }
    }

    #[test]
    fn deny_rule_takes_precedence() {
        let rules = CliRulesFile {
            deny: vec![DenyEntry {
                pattern: "rm *".into(),
            }],
            allow: vec![AllowEntry {
                pattern: "rm *.tmp".into(),
                network: false,
            }],
        };

        assert_eq!(
            check_command(&rules, "rm file.tmp"),
            CommandCheck::Denied {
                pattern: "rm *".into()
            }
        );
    }

    #[test]
    fn allow_rule_matches() {
        let rules = sample_rules();
        assert_eq!(
            check_command(&rules, "ls -la"),
            CommandCheck::Allowed { network: false }
        );
    }

    #[test]
    fn allow_with_network() {
        let rules = sample_rules();
        assert_eq!(
            check_command(&rules, "cargo build --release"),
            CommandCheck::Allowed { network: true }
        );
    }

    #[test]
    fn deny_matches() {
        let rules = sample_rules();
        // glob `*` does not match `/`, so use `**` in patterns for paths.
        assert_eq!(
            check_command(&rules, "rm -rf everything"),
            CommandCheck::Denied {
                pattern: "rm -rf *".into()
            }
        );
    }

    #[test]
    fn deny_with_glob_star_star_matches_paths() {
        let rules = CliRulesFile {
            deny: vec![DenyEntry {
                pattern: "rm -rf **".into(),
            }],
            allow: vec![],
        };
        assert_eq!(
            check_command(&rules, "rm -rf /tmp/foo"),
            CommandCheck::Denied {
                pattern: "rm -rf **".into()
            }
        );
    }

    #[test]
    fn unmatched_command() {
        let rules = sample_rules();
        assert_eq!(
            check_command(&rules, "python script.py"),
            CommandCheck::Unmatched
        );
    }

    #[test]
    fn empty_rules_returns_unmatched() {
        let rules = CliRulesFile::default();
        assert_eq!(check_command(&rules, "anything"), CommandCheck::Unmatched);
    }

    #[test]
    fn toml_round_trip() {
        let rules = sample_rules();
        let toml_str = toml::to_string_pretty(&rules).unwrap();
        let parsed: CliRulesFile = toml::from_str(&toml_str).unwrap();

        assert_eq!(parsed.deny.len(), 1);
        assert_eq!(parsed.allow.len(), 2);
        assert_eq!(parsed.deny[0].pattern, "rm -rf *");
        assert!(parsed.allow[0].network);
    }
}
