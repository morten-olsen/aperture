pub(crate) mod db;
pub(crate) mod jwt;
pub(crate) mod password;

use async_trait::async_trait;

use aperture_engine::error::{EngineError, Result};
use aperture_engine::plugin::{Plugin, SetupContext};

use crate::config::RuntimeConfig;
use crate::db::DatabaseService;

use self::jwt::{jwt_decode, jwt_encode, JwtClaims, JwtSecret};

/// High-level authentication service inserted into engine extensions.
///
/// Provides user CRUD, password-based authentication, and JWT token management.
#[derive(Clone)]
pub struct AuthService {
    db: DatabaseService,
    secret: JwtSecret,
}

impl AuthService {
    pub fn new(db: DatabaseService, secret: JwtSecret) -> Self {
        Self { db, secret }
    }

    /// Verify username/password and return the user + a signed JWT.
    pub async fn authenticate(
        &self,
        username: &str,
        password_input: &str,
    ) -> Result<(db::UserRow, String)> {
        let uname = username.to_string();
        let user = self
            .db
            .call(move |conn| db::get_user_by_username(conn, &uname))
            .await?
            .ok_or_else(|| EngineError::PluginSetup("invalid credentials".into()))?;

        let hash = user
            .password_hash
            .as_deref()
            .ok_or_else(|| EngineError::PluginSetup("user has no password set".into()))?;

        let valid = password::verify_password(password_input, hash)?;
        if !valid {
            return Err(EngineError::PluginSetup("invalid credentials".into()));
        }

        let token = jwt_encode(&self.secret, &user.id)?;
        Ok((user, token))
    }

    /// Decode and validate a JWT token, returning the claims.
    pub fn validate_token(&self, token: &str) -> Result<JwtClaims> {
        jwt_decode(&self.secret, token)
    }

    /// Look up a user by ID.
    pub async fn get_user(&self, user_id: &str) -> Result<Option<db::UserRow>> {
        let uid = user_id.to_string();
        self.db
            .call(move |conn| db::get_user_by_id(conn, &uid))
            .await
    }

    /// Create a new user with an optional password.
    pub async fn create_user(
        &self,
        username: &str,
        password_input: Option<&str>,
    ) -> Result<db::UserRow> {
        let hash = password_input.map(password::hash_password).transpose()?;

        let id = uuid::Uuid::new_v4().to_string();
        let uname = username.to_string();
        self.db
            .call(move |conn| db::create_user(conn, &id, &uname, hash.as_deref()))
            .await
    }

    /// Delete a user by ID.
    pub async fn delete_user(&self, user_id: &str) -> Result<()> {
        let uid = user_id.to_string();
        self.db.call(move |conn| db::delete_user(conn, &uid)).await
    }

    /// Set or update a user's password.
    pub async fn set_password(&self, user_id: &str, password_input: &str) -> Result<()> {
        let hash = password::hash_password(password_input)?;
        let uid = user_id.to_string();
        self.db
            .call(move |conn| db::set_password(conn, &uid, &hash))
            .await
    }

    /// List all users.
    pub async fn list_users(&self) -> Result<Vec<db::UserRow>> {
        self.db.call(db::list_users).await
    }

    /// Look up a user by username.
    pub async fn get_user_by_username(&self, username: &str) -> Result<Option<db::UserRow>> {
        let uname = username.to_string();
        self.db
            .call(move |conn| db::get_user_by_username(conn, &uname))
            .await
    }

    /// Encode a JWT for a given user ID.
    pub fn encode_token(&self, user_id: &str) -> Result<String> {
        jwt_encode(&self.secret, user_id)
    }
}

/// Plugin that creates and inserts the `AuthService` into extensions.
///
/// Must be registered after `DatabasePlugin`.
pub struct AuthPlugin;

#[async_trait]
impl Plugin for AuthPlugin {
    fn id(&self) -> &str {
        "auth"
    }

    fn description(&self) -> &str {
        "User authentication with password hashing and JWT tokens"
    }

    async fn setup(&self, ctx: &mut SetupContext<'_>) -> Result<()> {
        let config = ctx
            .extensions
            .get::<RuntimeConfig>()
            .ok_or_else(|| EngineError::PluginSetup("RuntimeConfig not found".into()))?
            .clone();

        let db = ctx
            .extensions
            .get::<DatabaseService>()
            .ok_or_else(|| EngineError::PluginSetup("DatabaseService not found".into()))?
            .clone();

        // Run migrations.
        db.call(db::migrate).await?;

        // Create or load JWT secret.
        let secret = JwtSecret::from_env_or_file(&config.data_root)?;

        let service = AuthService::new(db, secret);
        ctx.extensions.insert(service);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    fn test_auth_service() -> (DatabaseService, AuthService) {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL;").unwrap();
        let db = DatabaseService::new(conn);
        let secret = JwtSecret::from_bytes(b"test-secret-for-auth-service");
        let service = AuthService::new(db.clone(), secret);
        (db, service)
    }

    #[tokio::test]
    async fn create_user_and_authenticate() {
        let (db, service) = test_auth_service();
        db.call(db::migrate).await.unwrap();

        let user = service
            .create_user("alice", Some("password123"))
            .await
            .unwrap();
        assert_eq!(user.username, "alice");

        let (authed_user, token) = service.authenticate("alice", "password123").await.unwrap();
        assert_eq!(authed_user.id, user.id);

        let claims = service.validate_token(&token).unwrap();
        assert_eq!(claims.sub, user.id);
    }

    #[tokio::test]
    async fn wrong_password_fails() {
        let (db, service) = test_auth_service();
        db.call(db::migrate).await.unwrap();

        service.create_user("alice", Some("correct")).await.unwrap();
        let result = service.authenticate("alice", "wrong").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn user_without_password_cannot_login() {
        let (db, service) = test_auth_service();
        db.call(db::migrate).await.unwrap();

        service.create_user("alice", None).await.unwrap();
        let result = service.authenticate("alice", "anything").await;
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn set_password_then_login() {
        let (db, service) = test_auth_service();
        db.call(db::migrate).await.unwrap();

        let user = service.create_user("alice", None).await.unwrap();
        service.set_password(&user.id, "newpass").await.unwrap();

        let (_, token) = service.authenticate("alice", "newpass").await.unwrap();
        let claims = service.validate_token(&token).unwrap();
        assert_eq!(claims.sub, user.id);
    }

    #[tokio::test]
    async fn delete_user_removes_from_db() {
        let (db, service) = test_auth_service();
        db.call(db::migrate).await.unwrap();

        let user = service.create_user("alice", None).await.unwrap();
        service.delete_user(&user.id).await.unwrap();

        let fetched = service.get_user(&user.id).await.unwrap();
        assert!(fetched.is_none());
    }

    #[tokio::test]
    async fn list_users_returns_all() {
        let (db, service) = test_auth_service();
        db.call(db::migrate).await.unwrap();

        service.create_user("alice", None).await.unwrap();
        service.create_user("bob", None).await.unwrap();

        let users = service.list_users().await.unwrap();
        assert_eq!(users.len(), 2);
    }
}
