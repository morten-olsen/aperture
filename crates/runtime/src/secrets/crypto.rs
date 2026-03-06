use std::io::Write;
use std::path::Path;

use aes_gcm::aead::{Aead, OsRng};
use aes_gcm::{AeadCore, Aes256Gcm, Key, KeyInit};
use base64::engine::general_purpose::STANDARD as BASE64;
use base64::Engine;

use aperture_engine::error::{EngineError, Result};

/// 32-byte key for AES-256-GCM encryption.
#[derive(Clone)]
pub struct SecretKey {
    bytes: Vec<u8>,
}

impl SecretKey {
    /// Load key from `APERTURE_SECRET_KEY` env var (base64-decoded) or
    /// read/create `{data_root}/secret.key` (32 random bytes).
    pub fn from_env_or_file(data_root: &Path) -> Result<Self> {
        if let Ok(env_val) = std::env::var("APERTURE_SECRET_KEY") {
            let bytes = BASE64.decode(env_val.as_bytes()).map_err(|e| {
                EngineError::PluginSetup(format!("decode APERTURE_SECRET_KEY: {e}"))
            })?;
            if bytes.len() != 32 {
                return Err(EngineError::PluginSetup(format!(
                    "APERTURE_SECRET_KEY must be 32 bytes, got {}",
                    bytes.len()
                )));
            }
            return Ok(Self { bytes });
        }

        let key_path = data_root.join("secret.key");
        if key_path.exists() {
            let bytes = std::fs::read(&key_path)
                .map_err(|e| EngineError::PluginSetup(format!("read secret.key: {e}")))?;
            if bytes.len() != 32 {
                return Err(EngineError::PluginSetup(format!(
                    "secret.key must be 32 bytes, got {}",
                    bytes.len()
                )));
            }
            return Ok(Self { bytes });
        }

        // Generate a random 32-byte key and persist it.
        use rand::RngExt;
        let bytes: Vec<u8> = (0..32).map(|_| rand::rng().random()).collect();

        if let Some(parent) = key_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| EngineError::PluginSetup(format!("create data dir: {e}")))?;
        }
        {
            use std::os::unix::fs::OpenOptionsExt;
            let mut f = std::fs::OpenOptions::new()
                .write(true)
                .create(true)
                .truncate(true)
                .mode(0o600)
                .open(&key_path)
                .map_err(|e| EngineError::PluginSetup(format!("write secret.key: {e}")))?;
            f.write_all(&bytes)
                .map_err(|e| EngineError::PluginSetup(format!("write secret.key: {e}")))?;
        }

        Ok(Self { bytes })
    }

    #[cfg(test)]
    pub fn from_bytes(bytes: &[u8]) -> Self {
        Self {
            bytes: bytes.to_vec(),
        }
    }
}

/// Encrypt plaintext using AES-256-GCM. Returns base64(nonce ‖ ciphertext+tag).
pub fn encrypt(key: &SecretKey, plaintext: &str) -> Result<String> {
    let aes_key = Key::<Aes256Gcm>::from_slice(&key.bytes);
    let cipher = Aes256Gcm::new(aes_key);
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);

    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| EngineError::PluginSetup(format!("encryption failed: {e}")))?;

    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(BASE64.encode(&combined))
}

/// Decrypt a value produced by [`encrypt`].
pub fn decrypt(key: &SecretKey, encoded: &str) -> Result<String> {
    let combined = BASE64
        .decode(encoded.as_bytes())
        .map_err(|e| EngineError::PluginSetup(format!("base64 decode failed: {e}")))?;

    if combined.len() < 12 {
        return Err(EngineError::PluginSetup("encrypted data too short".into()));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = aes_gcm::Nonce::from_slice(nonce_bytes);
    let aes_key = Key::<Aes256Gcm>::from_slice(&key.bytes);
    let cipher = Aes256Gcm::new(aes_key);

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| EngineError::PluginSetup(format!("decryption failed: {e}")))?;

    String::from_utf8(plaintext)
        .map_err(|e| EngineError::PluginSetup(format!("decrypted data is not valid UTF-8: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_key() -> SecretKey {
        SecretKey::from_bytes(&[0xAB; 32])
    }

    #[test]
    fn round_trip() {
        let key = test_key();
        let plaintext = "my-super-secret-api-key";
        let encrypted = encrypt(&key, plaintext).unwrap();
        let decrypted = decrypt(&key, &encrypted).unwrap();
        assert_eq!(decrypted, plaintext);
    }

    #[test]
    fn wrong_key_fails() {
        let key1 = SecretKey::from_bytes(&[0xAB; 32]);
        let key2 = SecretKey::from_bytes(&[0xCD; 32]);
        let encrypted = encrypt(&key1, "secret").unwrap();
        let result = decrypt(&key2, &encrypted);
        assert!(result.is_err());
    }

    #[test]
    fn corrupted_data_fails() {
        let key = test_key();
        let result = decrypt(&key, "not-valid-base64!!!");
        assert!(result.is_err());
    }

    #[test]
    fn env_or_file_generates_and_reads() {
        let dir =
            std::env::temp_dir().join(format!("aperture-secret-key-test-{}", uuid::Uuid::new_v4()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        std::env::remove_var("APERTURE_SECRET_KEY");

        let k1 = SecretKey::from_env_or_file(&dir).unwrap();
        let k2 = SecretKey::from_env_or_file(&dir).unwrap();
        assert_eq!(k1.bytes, k2.bytes);

        // Encrypt with k1, decrypt with k2.
        let enc = encrypt(&k1, "test-value").unwrap();
        let dec = decrypt(&k2, &enc).unwrap();
        assert_eq!(dec, "test-value");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
