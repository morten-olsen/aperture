use serde::{Deserialize, Serialize};

/// A single allow rule: domains matching this pattern are permitted.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AllowEntry {
    pub domain: String,
}

/// A single deny rule: domains matching this pattern are rejected.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DenyEntry {
    pub domain: String,
}

/// Web domain rules file, deserialized from TOML.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct WebRulesFile {
    #[serde(default)]
    pub allow: Vec<AllowEntry>,
    #[serde(default)]
    pub deny: Vec<DenyEntry>,
}

/// Result of checking a domain against the rules.
#[derive(Debug, Clone, PartialEq)]
pub enum DomainCheck {
    /// Domain matches an allow rule.
    Allowed,
    /// Domain matches a deny rule.
    Denied { pattern: String },
    /// Domain matches no rule.
    Unmatched,
}

/// Check a domain against web rules. Deny rules are evaluated first.
pub fn check_domain(rules: &WebRulesFile, domain: &str) -> DomainCheck {
    for deny in &rules.deny {
        if glob_match::glob_match(&deny.domain, domain) {
            return DomainCheck::Denied {
                pattern: deny.domain.clone(),
            };
        }
    }

    for allow in &rules.allow {
        if glob_match::glob_match(&allow.domain, domain) {
            return DomainCheck::Allowed;
        }
    }

    DomainCheck::Unmatched
}

/// Load web rules from a TOML file. Returns default (empty) if file doesn't exist.
pub fn load_rules(path: &std::path::Path) -> Result<WebRulesFile, String> {
    if !path.exists() {
        return Ok(WebRulesFile::default());
    }

    let content =
        std::fs::read_to_string(path).map_err(|e| format!("failed to read web-rules.toml: {e}"))?;

    toml::from_str(&content).map_err(|e| format!("failed to parse web-rules.toml: {e}"))
}

/// Save web rules to a TOML file.
pub fn save_rules(path: &std::path::Path, rules: &WebRulesFile) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("failed to create configs directory: {e}"))?;
    }

    let content =
        toml::to_string_pretty(rules).map_err(|e| format!("failed to serialize rules: {e}"))?;

    std::fs::write(path, content).map_err(|e| format!("failed to write web-rules.toml: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_rules() -> WebRulesFile {
        WebRulesFile {
            deny: vec![DenyEntry {
                domain: "*.internal.corp".into(),
            }],
            allow: vec![
                AllowEntry {
                    domain: "docs.rs".into(),
                },
                AllowEntry {
                    domain: "*.github.com".into(),
                },
            ],
        }
    }

    #[test]
    fn deny_rule_takes_precedence() {
        let rules = WebRulesFile {
            deny: vec![DenyEntry {
                domain: "*.example.com".into(),
            }],
            allow: vec![AllowEntry {
                domain: "safe.example.com".into(),
            }],
        };

        assert_eq!(
            check_domain(&rules, "safe.example.com"),
            DomainCheck::Denied {
                pattern: "*.example.com".into()
            }
        );
    }

    #[test]
    fn allow_rule_matches() {
        let rules = sample_rules();
        assert_eq!(check_domain(&rules, "docs.rs"), DomainCheck::Allowed);
    }

    #[test]
    fn allow_wildcard_matches() {
        let rules = sample_rules();
        assert_eq!(check_domain(&rules, "api.github.com"), DomainCheck::Allowed);
    }

    #[test]
    fn deny_matches() {
        let rules = sample_rules();
        assert_eq!(
            check_domain(&rules, "secrets.internal.corp"),
            DomainCheck::Denied {
                pattern: "*.internal.corp".into()
            }
        );
    }

    #[test]
    fn unmatched_domain() {
        let rules = sample_rules();
        assert_eq!(check_domain(&rules, "example.com"), DomainCheck::Unmatched);
    }

    #[test]
    fn empty_rules_returns_unmatched() {
        let rules = WebRulesFile::default();
        assert_eq!(check_domain(&rules, "anything.com"), DomainCheck::Unmatched);
    }

    #[test]
    fn toml_round_trip() {
        let rules = sample_rules();
        let toml_str = toml::to_string_pretty(&rules).unwrap();
        let parsed: WebRulesFile = toml::from_str(&toml_str).unwrap();

        assert_eq!(parsed.deny.len(), 1);
        assert_eq!(parsed.allow.len(), 2);
        assert_eq!(parsed.deny[0].domain, "*.internal.corp");
        assert_eq!(parsed.allow[0].domain, "docs.rs");
    }
}
