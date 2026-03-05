use async_trait::async_trait;
use serde_json::{json, Value};

use aperture_engine::error::{EngineError, Result};
use aperture_engine::tool::{ToolContext, ToolInvoke};

pub struct WebHtmlToMarkdown;

#[async_trait]
impl ToolInvoke for WebHtmlToMarkdown {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let html = ctx.input.get("html").and_then(|v| v.as_str()).unwrap_or("");

        let markdown = html2text::from_read(html.as_bytes(), 80)
            .map_err(|e| EngineError::ToolInvocation(format!("HTML conversion failed: {e}")))?;

        Ok(json!({ "markdown": markdown }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;

    #[tokio::test]
    async fn converts_basic_html() {
        let html = "<h1>Title</h1><p>Hello <b>world</b></p>";

        let ext = Extensions::new();
        let mut state = State::new();
        let events = EventBus::new();

        let ctx = ToolContext {
            input: json!({ "html": html }),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "testuser".into(),
            replay: None,
        };

        let result = WebHtmlToMarkdown.invoke(ctx).await.unwrap();
        let md = result["markdown"].as_str().unwrap();
        assert!(md.contains("Title"), "expected 'Title' in: {md}");
        assert!(md.contains("world"), "expected 'world' in: {md}");
    }

    #[tokio::test]
    async fn empty_html_returns_empty_markdown() {
        let ext = Extensions::new();
        let mut state = State::new();
        let events = EventBus::new();

        let ctx = ToolContext {
            input: json!({ "html": "" }),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "testuser".into(),
            replay: None,
        };

        let result = WebHtmlToMarkdown.invoke(ctx).await.unwrap();
        let md = result["markdown"].as_str().unwrap();
        assert!(md.trim().is_empty());
    }
}
