use async_trait::async_trait;
use serde_json::Value;

use crate::error::Result;
use crate::event::EventBus;
use crate::extensions::Extensions;

pub struct ActionContext<'a> {
    pub user_id: String,
    pub input: Value,
    pub extensions: &'a Extensions,
    pub events: &'a EventBus,
}

#[async_trait]
pub trait ActionInvoke: Send + Sync {
    async fn invoke(&self, ctx: ActionContext<'_>) -> Result<Value>;
}

pub struct Action {
    pub id: String,
    pub description: String,
    pub input_schema: Value,
    pub output_schema: Option<Value>,
    pub invoke: Box<dyn ActionInvoke>,
}
