use std::sync::Arc;

use async_trait::async_trait;
use serde::{Deserialize, Serialize};

use crate::error::Result;

/// Summary of a plugin-owned secret (id + name, no value).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PluginSecretSummary {
    pub id: String,
    pub name: String,
}

/// Trait for plugins to store and retrieve their own secrets,
/// isolated from agent-visible secrets.
#[async_trait]
pub trait PluginSecretStore: Send + Sync {
    /// Retrieve the decrypted value of a plugin secret.
    fn get_plugin_secret(&self, user_id: &str, secret_id: &str) -> Result<String>;

    /// Encrypt and store a plugin secret.
    fn add_plugin_secret(&self, user_id: &str, id: &str, name: &str, value: &str) -> Result<()>;

    /// Remove a plugin secret. Returns whether it existed.
    fn remove_plugin_secret(&self, user_id: &str, secret_id: &str) -> Result<bool>;

    /// List plugin secrets for a user (id + name only).
    fn list_plugin_secrets(&self, user_id: &str) -> Result<Vec<PluginSecretSummary>>;
}

/// Newtype wrapper for inserting `PluginSecretStore` into the Extensions type map.
pub struct PluginSecretStoreService(pub Arc<dyn PluginSecretStore>);
