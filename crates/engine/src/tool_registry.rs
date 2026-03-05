use std::collections::HashMap;

use crate::tool::Tool;

/// Central registry of all tools registered by plugins at setup time.
///
/// Tools are stored by ID and can be looked up for direct invocation
/// (e.g. when `engine.approve()` needs to invoke an inner tool directly
/// without going through the sandbox).
pub struct ToolRegistry {
    entries: HashMap<String, Tool>,
}

impl ToolRegistry {
    pub fn new() -> Self {
        Self {
            entries: HashMap::new(),
        }
    }

    /// Register a tool. Overwrites any existing tool with the same ID.
    pub fn register(&mut self, tool: Tool) {
        self.entries.insert(tool.id.clone(), tool);
    }

    /// Look up a tool by ID.
    pub fn get(&self, id: &str) -> Option<&Tool> {
        self.entries.get(id)
    }

    /// Iterate over all registered tools.
    pub fn iter(&self) -> impl Iterator<Item = &Tool> {
        self.entries.values()
    }
}

impl Default for ToolRegistry {
    fn default() -> Self {
        Self::new()
    }
}
