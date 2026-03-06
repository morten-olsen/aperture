use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use aperture_engine::error::{EngineError, Result};

use crate::config::RuntimeConfig;

use super::crypto::{self, SecretKey};

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SecretEntry {
    id: String,
    name: String,
    encrypted_value: String,
    #[serde(default)]
    plugin: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SecretsFile {
    secrets: Vec<SecretEntry>,
}

/// Summary of a secret (id + name, no value).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SecretSummary {
    pub id: String,
    pub name: String,
}

/// Encrypted key-value secret store, scoped per user.
#[derive(Clone)]
pub struct SecretStore {
    config: RuntimeConfig,
    key: SecretKey,
}

impl SecretStore {
    pub fn new(config: RuntimeConfig, key: SecretKey) -> Self {
        Self { config, key }
    }

    fn secrets_path(&self, user_id: &str) -> PathBuf {
        self.config.data_root.join(user_id).join("secrets.json")
    }

    fn read_file(&self, user_id: &str) -> Result<SecretsFile> {
        let path = self.secrets_path(user_id);
        if !path.exists() {
            return Ok(SecretsFile {
                secrets: Vec::new(),
            });
        }
        let data = std::fs::read_to_string(&path)
            .map_err(|e| EngineError::PluginSetup(format!("read secrets file: {e}")))?;
        serde_json::from_str(&data)
            .map_err(|e| EngineError::PluginSetup(format!("parse secrets file: {e}")))
    }

    fn write_file(&self, user_id: &str, file: &SecretsFile) -> Result<()> {
        let path = self.secrets_path(user_id);
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| EngineError::PluginSetup(format!("create secrets dir: {e}")))?;
        }
        let data = serde_json::to_string_pretty(file)
            .map_err(|e| EngineError::PluginSetup(format!("serialize secrets: {e}")))?;
        std::fs::write(&path, data)
            .map_err(|e| EngineError::PluginSetup(format!("write secrets file: {e}")))
    }

    /// List agent secrets for a user (id + name only, no decryption).
    /// Excludes plugin-owned secrets.
    pub fn list(&self, user_id: &str) -> Result<Vec<SecretSummary>> {
        let file = self.read_file(user_id)?;
        Ok(file
            .secrets
            .into_iter()
            .filter(|e| e.plugin.is_none())
            .map(|e| SecretSummary {
                id: e.id,
                name: e.name,
            })
            .collect())
    }

    /// Decrypt and return the plaintext value of a secret.
    pub fn get_value(&self, user_id: &str, secret_id: &str) -> Result<String> {
        let file = self.read_file(user_id)?;
        let entry = file
            .secrets
            .iter()
            .find(|e| e.id == secret_id)
            .ok_or_else(|| EngineError::ToolInvocation(format!("secret not found: {secret_id}")))?;
        crypto::decrypt(&self.key, &entry.encrypted_value)
    }

    /// Encrypt and upsert a secret.
    pub fn add(&self, user_id: &str, id: &str, name: &str, value: &str) -> Result<()> {
        let encrypted = crypto::encrypt(&self.key, value)?;
        let mut file = self.read_file(user_id)?;

        if let Some(existing) = file.secrets.iter_mut().find(|e| e.id == id) {
            existing.name = name.to_string();
            existing.encrypted_value = encrypted;
        } else {
            file.secrets.push(SecretEntry {
                id: id.to_string(),
                name: name.to_string(),
                encrypted_value: encrypted,
                plugin: None,
            });
        }

        self.write_file(user_id, &file)
    }

    /// List secrets owned by a specific plugin.
    pub fn list_by_plugin(&self, user_id: &str, plugin_id: &str) -> Result<Vec<SecretSummary>> {
        let file = self.read_file(user_id)?;
        Ok(file
            .secrets
            .into_iter()
            .filter(|e| e.plugin.as_deref() == Some(plugin_id))
            .map(|e| SecretSummary {
                id: e.id,
                name: e.name,
            })
            .collect())
    }

    /// Decrypt and return a plugin-owned secret's value.
    pub fn get_plugin_value(&self, user_id: &str, secret_id: &str) -> Result<String> {
        let file = self.read_file(user_id)?;
        let entry = file
            .secrets
            .iter()
            .find(|e| e.id == secret_id && e.plugin.is_some())
            .ok_or_else(|| {
                EngineError::ToolInvocation(format!("plugin secret not found: {secret_id}"))
            })?;
        crypto::decrypt(&self.key, &entry.encrypted_value)
    }

    /// Encrypt and upsert a plugin-owned secret.
    pub fn add_for_plugin(
        &self,
        user_id: &str,
        plugin_id: &str,
        id: &str,
        name: &str,
        value: &str,
    ) -> Result<()> {
        let encrypted = crypto::encrypt(&self.key, value)?;
        let mut file = self.read_file(user_id)?;

        if let Some(existing) = file.secrets.iter_mut().find(|e| e.id == id) {
            existing.name = name.to_string();
            existing.encrypted_value = encrypted;
            existing.plugin = Some(plugin_id.to_string());
        } else {
            file.secrets.push(SecretEntry {
                id: id.to_string(),
                name: name.to_string(),
                encrypted_value: encrypted,
                plugin: Some(plugin_id.to_string()),
            });
        }

        self.write_file(user_id, &file)
    }

    /// Remove a plugin-owned secret. Returns whether it existed.
    pub fn remove_for_plugin(&self, user_id: &str, secret_id: &str) -> Result<bool> {
        let mut file = self.read_file(user_id)?;
        let before = file.secrets.len();
        file.secrets
            .retain(|e| !(e.id == secret_id && e.plugin.is_some()));
        let removed = file.secrets.len() < before;
        if removed {
            self.write_file(user_id, &file)?;
        }
        Ok(removed)
    }

    /// Remove a secret. Returns whether it existed.
    pub fn remove(&self, user_id: &str, secret_id: &str) -> Result<bool> {
        let mut file = self.read_file(user_id)?;
        let before = file.secrets.len();
        file.secrets.retain(|e| e.id != secret_id);
        let removed = file.secrets.len() < before;
        if removed {
            self.write_file(user_id, &file)?;
        }
        Ok(removed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    fn test_store() -> (PathBuf, SecretStore) {
        let dir = std::env::temp_dir().join(format!(
            "aperture-secret-store-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let config = RuntimeConfig {
            data_root: dir.clone(),
            cli_timeout_ms: 30_000,
            cli_max_output_bytes: 10_000_000,
            web_timeout_ms: 30_000,
            web_max_response_bytes: 10_000_000,
        };
        let key = SecretKey::from_bytes(&[0x42; 32]);
        (dir, SecretStore::new(config, key))
    }

    #[test]
    fn add_and_list() {
        let (dir, store) = test_store();
        store
            .add("alice", "cal_pw", "Calendar Password", "s3cr3t!!")
            .unwrap();
        let list = store.list("alice").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, "cal_pw");
        assert_eq!(list[0].name, "Calendar Password");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn get_value_round_trip() {
        let (dir, store) = test_store();
        store
            .add("alice", "key1", "API Key", "hunter2-password")
            .unwrap();
        let val = store.get_value("alice", "key1").unwrap();
        assert_eq!(val, "hunter2-password");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn upsert_overwrites() {
        let (dir, store) = test_store();
        store.add("alice", "key1", "Old Name", "old-value").unwrap();
        store.add("alice", "key1", "New Name", "new-value").unwrap();
        let list = store.list("alice").unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].name, "New Name");
        assert_eq!(store.get_value("alice", "key1").unwrap(), "new-value");
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn remove_returns_whether_existed() {
        let (dir, store) = test_store();
        store.add("alice", "key1", "K", "val12345").unwrap();
        assert!(store.remove("alice", "key1").unwrap());
        assert!(!store.remove("alice", "key1").unwrap());
        assert!(store.list("alice").unwrap().is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn get_missing_secret_fails() {
        let (dir, store) = test_store();
        let result = store.get_value("alice", "nonexistent");
        assert!(result.is_err());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn plugin_secrets_isolated_from_agent_list() {
        let (dir, store) = test_store();
        store.add("alice", "agent_key", "Agent Key", "a").unwrap();
        store
            .add_for_plugin("alice", "calendar", "cal_pw", "Cal Password", "b")
            .unwrap();

        let agent_list = store.list("alice").unwrap();
        assert_eq!(agent_list.len(), 1);
        assert_eq!(agent_list[0].id, "agent_key");

        let plugin_list = store.list_by_plugin("alice", "calendar").unwrap();
        assert_eq!(plugin_list.len(), 1);
        assert_eq!(plugin_list[0].id, "cal_pw");

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn plugin_secret_get_and_remove() {
        let (dir, store) = test_store();
        store
            .add_for_plugin("alice", "calendar", "pw1", "Password", "s3cret")
            .unwrap();

        assert_eq!(store.get_plugin_value("alice", "pw1").unwrap(), "s3cret");
        assert!(store.remove_for_plugin("alice", "pw1").unwrap());
        assert!(!store.remove_for_plugin("alice", "pw1").unwrap());

        let _ = std::fs::remove_dir_all(&dir);
    }
}
