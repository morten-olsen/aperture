use std::io::Write;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use aperture_engine::error::{EngineError, Result};

/// Wraps the secret bytes used for signing and verifying JWTs.
#[derive(Clone)]
pub struct JwtSecret {
    secret: Vec<u8>,
}

impl JwtSecret {
    /// Load JWT secret from `JWT_SECRET` env var, or read/create a file at `{data_root}/jwt_secret`.
    pub fn from_env_or_file(data_root: &Path) -> Result<Self> {
        if let Ok(env_secret) = std::env::var("JWT_SECRET") {
            return Ok(Self {
                secret: env_secret.into_bytes(),
            });
        }

        let secret_path = data_root.join("jwt_secret");
        if secret_path.exists() {
            let bytes = std::fs::read(&secret_path)
                .map_err(|e| EngineError::PluginSetup(format!("read jwt_secret: {e}")))?;
            return Ok(Self { secret: bytes });
        }

        // Generate a random secret and persist it.
        use rand::distr::Alphanumeric;
        use rand::RngExt;
        let secret: Vec<u8> = rand::rng()
            .sample_iter(Alphanumeric)
            .take(64)
            .collect();

        if let Some(parent) = secret_path.parent() {
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
                .open(&secret_path)
                .map_err(|e| EngineError::PluginSetup(format!("write jwt_secret: {e}")))?;
            f.write_all(&secret)
                .map_err(|e| EngineError::PluginSetup(format!("write jwt_secret: {e}")))?;
        }

        Ok(Self { secret })
    }

    #[cfg(test)]
    pub fn from_bytes(secret: &[u8]) -> Self {
        Self {
            secret: secret.to_vec(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct JwtClaims {
    pub sub: String,
    pub iat: u64,
}

pub fn jwt_encode(secret: &JwtSecret, user_id: &str) -> Result<String> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| EngineError::PluginSetup(format!("system time error: {e}")))?;

    let claims = JwtClaims {
        sub: user_id.to_string(),
        iat: now.as_secs(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(&secret.secret),
    )
    .map_err(|e| EngineError::PluginSetup(format!("JWT encode error: {e}")))
}

pub fn jwt_decode(secret: &JwtSecret, token: &str) -> Result<JwtClaims> {
    let mut validation = Validation::default();
    validation.required_spec_claims.clear();
    validation.validate_exp = false;

    let data = decode::<JwtClaims>(
        token,
        &DecodingKey::from_secret(&secret.secret),
        &validation,
    )
    .map_err(|e| EngineError::PluginSetup(format!("JWT decode error: {e}")))?;

    Ok(data.claims)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn encode_and_decode() {
        let secret = JwtSecret::from_bytes(b"test-secret-key-for-testing");
        let token = jwt_encode(&secret, "user-123").unwrap();
        let claims = jwt_decode(&secret, &token).unwrap();
        assert_eq!(claims.sub, "user-123");
        assert!(claims.iat > 0);
    }

    #[test]
    fn wrong_secret_fails() {
        let secret1 = JwtSecret::from_bytes(b"secret-one");
        let secret2 = JwtSecret::from_bytes(b"secret-two");
        let token = jwt_encode(&secret1, "user-1").unwrap();
        let result = jwt_decode(&secret2, &token);
        assert!(result.is_err());
    }

    #[test]
    fn invalid_token_fails() {
        let secret = JwtSecret::from_bytes(b"test-secret");
        let result = jwt_decode(&secret, "not-a-real-token");
        assert!(result.is_err());
    }

    #[test]
    fn from_env_or_file_generates_and_reads() {
        let dir = std::env::temp_dir().join("aperture-jwt-test");
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();

        // Remove env var to test file path.
        std::env::remove_var("JWT_SECRET");

        let s1 = JwtSecret::from_env_or_file(&dir).unwrap();
        let s2 = JwtSecret::from_env_or_file(&dir).unwrap();
        assert_eq!(s1.secret, s2.secret);

        // Token from s1 decodes with s2.
        let token = jwt_encode(&s1, "u1").unwrap();
        let claims = jwt_decode(&s2, &token).unwrap();
        assert_eq!(claims.sub, "u1");

        let _ = std::fs::remove_dir_all(&dir);
    }
}
