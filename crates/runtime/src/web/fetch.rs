use std::time::Duration;

use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::tool::{ToolContext, ToolInvoke};

use super::rules::{check_domain, load_rules, DomainCheck};
use crate::config::RuntimeConfig;

pub struct WebFetch;

#[async_trait]
impl ToolInvoke for WebFetch {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let config = ctx.extensions.get::<RuntimeConfig>().ok_or_else(|| {
            EngineError::ToolInvocation("RuntimeConfig not found in extensions".into())
        })?;

        let url_str = ctx
            .input
            .get("url")
            .and_then(|v| v.as_str())
            .ok_or_else(|| EngineError::ToolInvocation("missing required field: url".into()))?;

        let parsed_url = url::Url::parse(url_str)
            .map_err(|e| EngineError::ToolInvocation(format!("invalid URL: {e}")))?;

        let domain = parsed_url
            .host_str()
            .ok_or_else(|| EngineError::ToolInvocation("URL has no host".into()))?;

        // Defense-in-depth: re-check domain rules before fetching.
        let rules_path = config.configs_dir(&ctx.user_id).join("web-rules.toml");
        let rules = load_rules(&rules_path).map_err(EngineError::ToolInvocation)?;

        match check_domain(&rules, domain) {
            DomainCheck::Allowed => {}
            DomainCheck::Denied { pattern } => {
                return Err(EngineError::tool_error(
                    format!("domain blocked by deny rule: \"{pattern}\""),
                    json!({ "url": url_str, "domain": domain, "pattern": pattern }),
                ));
            }
            DomainCheck::Unmatched => {
                return Err(EngineError::tool_error(
                    format!("domain \"{domain}\" has no matching allow rule"),
                    json!({ "url": url_str, "domain": domain }),
                ));
            }
        }

        let timeout_ms = ctx
            .input
            .get("timeout")
            .and_then(|v| v.as_u64())
            .unwrap_or(config.web_timeout_ms);

        let client = reqwest::Client::builder()
            .timeout(Duration::from_millis(timeout_ms))
            .build()
            .map_err(|e| {
                EngineError::ToolInvocation(format!("failed to build HTTP client: {e}"))
            })?;

        let mut request = client.get(url_str);

        if let Some(headers) = ctx.input.get("headers").and_then(|v| v.as_object()) {
            for (key, value) in headers {
                if let Some(val) = value.as_str() {
                    request = request.header(key.as_str(), val);
                }
            }
        }

        let response = request.send().await.map_err(|e| {
            EngineError::tool_error(
                format!("HTTP request failed: {e}"),
                json!({ "url": url_str }),
            )
        })?;

        let status = response.status().as_u16();

        let headers_map: serde_json::Map<String, Value> = response
            .headers()
            .iter()
            .filter_map(|(k, v)| {
                v.to_str()
                    .ok()
                    .map(|val| (k.as_str().to_string(), Value::String(val.to_string())))
            })
            .collect();

        let content_type = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        let body = response.text().await.map_err(|e| {
            EngineError::tool_error(
                format!("failed to read response body: {e}"),
                json!({ "url": url_str }),
            )
        })?;

        let body = if body.len() > config.web_max_response_bytes {
            let truncated = &body[..config.web_max_response_bytes];
            format!(
                "{truncated}\n\n[truncated at {} bytes]",
                config.web_max_response_bytes
            )
        } else {
            body
        };

        Ok(json!({
            "url": url_str,
            "status": status,
            "headers": headers_map,
            "body": body,
            "content_type": content_type,
        }))
    }
}
