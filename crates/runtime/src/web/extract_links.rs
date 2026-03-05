use async_trait::async_trait;
use scraper::{Html, Selector};
use serde_json::{json, Value};

use aperture_engine::error::Result;
use aperture_engine::tool::{ToolContext, ToolInvoke};

pub struct WebExtractLinks;

#[async_trait]
impl ToolInvoke for WebExtractLinks {
    async fn invoke(&self, ctx: ToolContext<'_>) -> Result<Value> {
        let html = ctx.input.get("html").and_then(|v| v.as_str()).unwrap_or("");

        let base_url = ctx
            .input
            .get("base_url")
            .and_then(|v| v.as_str())
            .and_then(|u| url::Url::parse(u).ok());

        let document = Html::parse_document(html);
        let selector = Selector::parse("a[href]").expect("valid selector");

        let links: Vec<Value> = document
            .select(&selector)
            .filter_map(|el| {
                let href_raw = el.value().attr("href")?;
                let text = el.text().collect::<String>();
                let text = text.trim().to_string();

                let href = if let Some(base) = &base_url {
                    base.join(href_raw).ok().map(|u| u.to_string())
                } else {
                    Some(href_raw.to_string())
                };

                href.map(|h| {
                    json!({
                        "href": h,
                        "text": text,
                    })
                })
            })
            .collect();

        Ok(json!({ "links": links }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use aperture_engine::event::EventBus;
    use aperture_engine::extensions::Extensions;
    use aperture_engine::state::State;

    #[tokio::test]
    async fn extracts_absolute_links() {
        let html = r#"<html><body>
            <a href="https://example.com/page">Example</a>
            <a href="https://other.com">Other</a>
        </body></html>"#;

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

        let result = WebExtractLinks.invoke(ctx).await.unwrap();
        let links = result["links"].as_array().unwrap();
        assert_eq!(links.len(), 2);
        assert_eq!(links[0]["href"], "https://example.com/page");
        assert_eq!(links[0]["text"], "Example");
    }

    #[tokio::test]
    async fn resolves_relative_urls() {
        let html = r#"<a href="/about">About</a><a href="page.html">Page</a>"#;

        let ext = Extensions::new();
        let mut state = State::new();
        let events = EventBus::new();

        let ctx = ToolContext {
            input: json!({ "html": html, "base_url": "https://example.com/docs/" }),
            state: &mut state,
            extensions: &ext,
            events: &events,
            user_id: "testuser".into(),
            replay: None,
        };

        let result = WebExtractLinks.invoke(ctx).await.unwrap();
        let links = result["links"].as_array().unwrap();
        assert_eq!(links.len(), 2);
        assert_eq!(links[0]["href"], "https://example.com/about");
        assert_eq!(links[1]["href"], "https://example.com/docs/page.html");
    }

    #[tokio::test]
    async fn empty_html_returns_empty_links() {
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

        let result = WebExtractLinks.invoke(ctx).await.unwrap();
        let links = result["links"].as_array().unwrap();
        assert!(links.is_empty());
    }
}
