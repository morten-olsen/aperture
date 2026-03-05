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

    /// List secrets for a user (id + name only, no decryption).
    pub fn list(&self, user_id: &str) -> Result<Vec<SecretSummary>> {
        let file = self.read_file(user_id)?;
        Ok(file
            .secrets
            .into_iter()
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
            });
        }

        self.write_file(user_id, &file)
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
}
