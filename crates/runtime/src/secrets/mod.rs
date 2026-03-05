pub(crate) mod crypto;
pub(crate) mod store;
pub(crate) mod tools;

use async_trait::async_trait;
use serde_json::json;

use aperture_engine::error::{EngineError, Result};
use aperture_engine::plugin::{Plugin, PrepareContext, SetupContext};
use aperture_engine::redaction::RedactionRegistry;
use aperture_engine::tool::{ApprovalRequirement, Tool};

use crate::config::RuntimeConfig;

pub use self::store::{SecretStore, SecretSummary};

use self::crypto::SecretKey;
use self::tools::{SecretsGetValue, SecretsList};

/// Plugin providing encrypted secret storage and tool access.
///
/// Agents can list and retrieve secrets without the LLM ever seeing plaintext
/// in its context — retrieved values are tracked in the `RedactionRegistry`
/// and scrubbed from sandbox output.
pub struct SecretPlugin;

#[async_trait]
impl Plugin for SecretPlugin {
    fn id(&self) -> &str {
        "secrets"
    }

    fn description(&self) -> &str {
        "Encrypted secret storage with automatic redaction"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        let config = ctx
            .extensions
            .get::<RuntimeConfig>()
            .ok_or_else(|| EngineError::PluginSetup("RuntimeConfig not found".into()))?
            .clone();

        let key = SecretKey::from_env_or_file(&config.data_root)?;
        let store = SecretStore::new(config, key);
        ctx.extensions.insert(store);

        if !ctx.extensions.contains::<RedactionRegistry>() {
            ctx.extensions.insert(RedactionRegistry::default());
        }

        Ok(())
    }

    async fn prepare(&self, ctx: &mut PrepareContext<'_>) -> Result<()> {
        ctx.tools.push(Tool {
            id: "secrets_list".into(),
            description: "List available secrets (id and name only, no values).".into(),
            input_schema: json!({
                "type": "object",
                "properties": {}
            }),
            output_schema: None,
            require_approval: None,
            invoke: Box::new(SecretsList),
        });

        ctx.tools.push(Tool {
            id: "secrets_get_value".into(),
            description: "Retrieve the decrypted value of a secret by ID. The value will be automatically redacted from any output visible to the model.".into(),
            input_schema: json!({
                "type": "object",
                "properties": {
                    "secret_id": { "type": "string", "description": "The secret ID to retrieve" }
                },
                "required": ["secret_id"]
            }),
            output_schema: None,
            require_approval: Some(ApprovalRequirement::Always {
                reason: "Accessing a secret value".into(),
            }),
            invoke: Box::new(SecretsGetValue),
        });

        Ok(())
    }
}
