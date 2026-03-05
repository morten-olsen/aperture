use aperture_engine::sandbox::ToolDescriptor;

/// Generate a human-readable function listing from tool descriptors.
///
/// Produces text like:
/// ```text
/// You can execute JavaScript using the `run_code` tool. The following
/// functions are available inside the sandbox:
///
/// - read_file(path: string): string — Read a file's contents
/// - write_file(path: string, content: string): void — Write content to a file
///
/// Use `inspect_tool` to get the full schema for any function.
/// ```
pub fn generate_listing(tools: &[ToolDescriptor]) -> String {
    if tools.is_empty() {
        return "You can execute JavaScript using the `run_code` tool. \
                No tool functions are available in the sandbox.\n\
                Use `inspect_tool` to get the full schema for any function."
            .to_string();
    }

    let mut lines = Vec::new();
    lines.push(
        "You can execute JavaScript using the `run_code` tool. The following\n\
         functions are available inside the sandbox:"
            .to_string(),
    );
    lines.push(String::new());

    for tool in tools {
        let signature = format_signature(tool);
        lines.push(format!("- {signature} — {}", tool.description));
    }

    lines.push(String::new());
    lines.push("Use `inspect_tool` to get the full schema for any function.".to_string());

    lines.join("\n")
}

/// Format a function signature like `read_file(path: string): string`.
fn format_signature(tool: &ToolDescriptor) -> String {
    let params = format_params(&tool.input_schema);
    let ret = format_return_type(&tool.output_schema);
    format!("{name}({params}){ret}", name = tool.id)
}

/// Extract parameter names and types from a JSON Schema `properties` object.
///
/// Orders parameters by their position in the `required` array first,
/// then appends optional parameters in alphabetical order.
fn format_params(schema: &serde_json::Value) -> String {
    let Some(properties) = schema.get("properties").and_then(|p| p.as_object()) else {
        return "input: object".to_string();
    };

    if properties.is_empty() {
        return String::new();
    }

    let required: Vec<&str> = schema
        .get("required")
        .and_then(|r| r.as_array())
        .map(|arr| arr.iter().filter_map(|v| v.as_str()).collect())
        .unwrap_or_default();

    // Required params first (in the order they appear in the required array),
    // then optional params alphabetically.
    let mut params: Vec<String> = Vec::new();

    for &name in &required {
        if let Some(prop) = properties.get(name) {
            let type_name = json_schema_type(prop);
            params.push(format!("{name}: {type_name}"));
        }
    }

    let mut optional: Vec<&String> = properties
        .keys()
        .filter(|k| !required.contains(&k.as_str()))
        .collect();
    optional.sort();

    for name in optional {
        if let Some(prop) = properties.get(name) {
            let type_name = json_schema_type(prop);
            params.push(format!("{name}?: {type_name}"));
        }
    }

    params.join(", ")
}

/// Map a JSON Schema type to a readable TypeScript-like type name.
fn json_schema_type(schema: &serde_json::Value) -> &str {
    match schema.get("type").and_then(|t| t.as_str()) {
        Some("string") => "string",
        Some("number") | Some("integer") => "number",
        Some("boolean") => "boolean",
        Some("array") => "array",
        Some("object") => "object",
        Some("null") => "null",
        _ => "any",
    }
}

/// Format the return type annotation from an output schema.
fn format_return_type(schema: &Option<serde_json::Value>) -> String {
    match schema {
        Some(s) => {
            let t = json_schema_type(s);
            format!(": {t}")
        }
        None => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn make_descriptor(id: &str, desc: &str, schema: serde_json::Value) -> ToolDescriptor {
        ToolDescriptor {
            id: id.to_string(),
            description: desc.to_string(),
            input_schema: schema,
            output_schema: None,
        }
    }

    #[test]
    fn listing_with_typed_params() {
        let tools = vec![
            ToolDescriptor {
                id: "read_file".to_string(),
                description: "Read a file's contents".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" }
                    },
                    "required": ["path"]
                }),
                output_schema: Some(json!({"type": "string"})),
            },
            ToolDescriptor {
                id: "write_file".to_string(),
                description: "Write content to a file".to_string(),
                input_schema: json!({
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "content": { "type": "string" }
                    },
                    "required": ["path", "content"]
                }),
                output_schema: None,
            },
        ];

        let listing = generate_listing(&tools);
        assert!(listing.contains("read_file(path: string): string"));
        assert!(listing.contains("write_file(path: string, content: string)"));
        assert!(!listing.contains("write_file(path: string, content: string):"));
        assert!(listing.contains("inspect_tool"));
    }

    #[test]
    fn listing_with_no_properties_falls_back() {
        let tools = vec![make_descriptor(
            "get_time",
            "Get current time",
            json!({"type": "object"}),
        )];

        let listing = generate_listing(&tools);
        assert!(listing.contains("get_time(input: object)"));
    }

    #[test]
    fn listing_with_empty_properties() {
        let tools = vec![make_descriptor(
            "get_time",
            "Get current time",
            json!({"type": "object", "properties": {}}),
        )];

        let listing = generate_listing(&tools);
        assert!(listing.contains("get_time()"));
    }

    #[test]
    fn listing_marks_optional_params() {
        let tools = vec![ToolDescriptor {
            id: "query".to_string(),
            description: "Run a query".to_string(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "sql": { "type": "string" },
                    "limit": { "type": "number" }
                },
                "required": ["sql"]
            }),
            output_schema: Some(json!({"type": "array"})),
        }];

        let listing = generate_listing(&tools);
        assert!(listing.contains("sql: string"));
        assert!(listing.contains("limit?: number"));
    }

    #[test]
    fn empty_tools_listing() {
        let listing = generate_listing(&[]);
        assert!(listing.contains("No tool functions"));
        assert!(listing.contains("inspect_tool"));
    }
}
