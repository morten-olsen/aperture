mod extract_links;
mod fetch;
mod html_to_md;
mod rules;
mod rules_tools;

use std::sync::Arc;

use async_trait::async_trait;
use serde_json::json;

use aperture_engine::error::Result;
use aperture_engine::plugin::{Plugin, PrepareContext, SetupContext};
use aperture_engine::tool::{ApprovalRequirement, Tool};

use self::extract_links::WebExtractLinks;
use self::fetch::WebFetch;
use self::html_to_md::WebHtmlToMarkdown;
use self::rules::{check_domain, load_rules, DomainCheck};
use self::rules_tools::{WebRulesAdd, WebRulesList, WebRulesRemove};
use crate::config::RuntimeConfig;

pub struct WebPlugin;

const WEB_TOOL_IDS: &[&str] = &[
    "web_fetch",
    "web_extract_links",
    "web_html_to_markdown",
    "web_rules_list",
    "web_rules_add",
    "web_rules_remove",
];

#[async_trait]
impl Plugin for WebPlugin {
    fn id(&self) -> &str {
        "web"
    }

    fn description(&self) -> &str {
        "Provides web content fetching with configurable domain allow/deny rules"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        let config = ctx.extensions.get::<RuntimeConfig>().cloned();

        ctx.registry.register(Tool {
            id: "web_fetch".into(),
            description: "Fetch the content of a web page by URL. \
                          Access is controlled by domain allow/deny rules."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL to fetch"
                    },
                    "headers": {
                        "type": "object",
                        "description": "Optional HTTP headers to include in the request",
                        "additionalProperties": { "type": "string" }
                    },
                    "timeout": {
                        "type": "number",
                        "description": "Timeout in milliseconds (optional, defaults to 30000)"
                    }
                },
                "required": ["url"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string" },
                    "status": { "type": "integer" },
                    "headers": { "type": "object" },
                    "body": { "type": "string" },
                    "content_type": { "type": "string" }
                }
            })),
            require_approval: Some(ApprovalRequirement::Dynamic(Arc::new(
                move |input, approval_ctx| {
                    let url_str = match input.get("url").and_then(|v| v.as_str()) {
                        Some(u) => u,
                        None => return Some("missing url".into()),
                    };

                    let parsed = match url::Url::parse(url_str) {
                        Ok(u) => u,
                        Err(_) => return Some(format!("invalid URL: {url_str}")),
                    };

                    let domain = match parsed.host_str() {
                        Some(d) => d.to_string(),
                        None => return Some("URL has no host".into()),
                    };

                    let config = match &config {
                        Some(c) => c,
                        None => return Some("runtime config not available".into()),
                    };

                    let rules_path = config
                        .configs_dir(approval_ctx.user_id)
                        .join("web-rules.toml");

                    let rules = match load_rules(&rules_path) {
                        Ok(r) => r,
                        Err(_) => {
                            return Some(format!("Domain \"{domain}\" has no matching allow rule"))
                        }
                    };

                    match check_domain(&rules, &domain) {
                        DomainCheck::Allowed => None,
                        DomainCheck::Denied { pattern } => {
                            Some(format!("BLOCKED: matches deny rule \"{pattern}\""))
                        }
                        DomainCheck::Unmatched => {
                            Some(format!("Domain \"{domain}\" has no matching allow rule"))
                        }
                    }
                },
            ))),
            invoke: Arc::new(WebFetch),
        });

        ctx.registry.register(Tool {
            id: "web_extract_links".into(),
            description: "Extract all links from an HTML string. \
                          Optionally resolves relative URLs against a base URL."
                .into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "html": {
                        "type": "string",
                        "description": "The HTML content to extract links from"
                    },
                    "base_url": {
                        "type": "string",
                        "description": "Optional base URL for resolving relative links"
                    }
                },
                "required": ["html"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "links": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "href": { "type": "string" },
                                "text": { "type": "string" }
                            }
                        }
                    }
                }
            })),
            require_approval: None,
            invoke: Arc::new(WebExtractLinks),
        });

        ctx.registry.register(Tool {
            id: "web_html_to_markdown".into(),
            description: "Convert HTML content to Markdown text.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "html": {
                        "type": "string",
                        "description": "The HTML content to convert"
                    }
                },
                "required": ["html"]
            }),
            output_schema: Some(json!({
                "type": "object",
                "properties": {
                    "markdown": { "type": "string" }
                }
            })),
            require_approval: None,
            invoke: Arc::new(WebHtmlToMarkdown),
        });

        ctx.registry.register(Tool {
            id: "web_rules_list".into(),
            description: "List all web domain allow/deny rules for the current user.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Listing web rules requires approval".into(),
            }),
            invoke: Arc::new(WebRulesList),
        });

        ctx.registry.register(Tool {
            id: "web_rules_add".into(),
            description: "Add a new web domain allow or deny rule.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "Glob pattern to match domains against"
                    },
                    "action": {
                        "type": "string",
                        "enum": ["allow", "deny"],
                        "description": "Whether to allow or deny matching domains (default: allow)"
                    }
                },
                "required": ["domain"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Adding web rules requires approval".into(),
            }),
            invoke: Arc::new(WebRulesAdd),
        });

        ctx.registry.register(Tool {
            id: "web_rules_remove".into(),
            description: "Remove a web domain rule by its exact domain pattern.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "domain": {
                        "type": "string",
                        "description": "The exact domain pattern of the rule to remove"
                    }
                },
                "required": ["domain"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Removing web rules requires approval".into(),
            }),
            invoke: Arc::new(WebRulesRemove),
        });

        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        for id in WEB_TOOL_IDS {
            ctx.activate_tool(id)?;
        }
        Ok(())
    }
}
