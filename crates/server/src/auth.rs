use std::sync::Arc;

use axum::extract::State;
use axum::http::{HeaderMap, StatusCode};
use axum::Json;

use aperture_protocol::{LoginRequest, LoginResponse, UserInfo};
use aperture_runtime::AuthService;

use crate::ws::AppState;

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(body): Json<LoginRequest>,
) -> Result<Json<LoginResponse>, (StatusCode, String)> {
    let auth = state.engine.get_extension::<AuthService>().ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "auth service not configured".to_string(),
        )
    })?;

    let (user, token) = auth
        .authenticate(&body.username, &body.password)
        .await
        .map_err(|_| (StatusCode::UNAUTHORIZED, "invalid credentials".to_string()))?;

    Ok(Json(LoginResponse {
        token,
        user: UserInfo {
            id: user.id,
            username: user.username,
            created_at: user.created_at,
        },
    }))
}

pub async fn me(
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
) -> Result<Json<UserInfo>, (StatusCode, String)> {
    let auth_header = headers
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| {
            (
                StatusCode::UNAUTHORIZED,
                "missing Authorization header".to_string(),
            )
        })?;

    let token = auth_header.strip_prefix("Bearer ").ok_or_else(|| {
        (
            StatusCode::UNAUTHORIZED,
            "invalid Authorization header format".to_string(),
        )
    })?;

    let auth = state.engine.get_extension::<AuthService>().ok_or_else(|| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            "auth service not configured".to_string(),
        )
    })?;

    let claims = auth
        .validate_token(token)
        .map_err(|_| (StatusCode::UNAUTHORIZED, "invalid token".to_string()))?;

    let user = auth
        .get_user(&claims.sub)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| (StatusCode::NOT_FOUND, "user not found".to_string()))?;

    Ok(Json(UserInfo {
        id: user.id,
        username: user.username,
        created_at: user.created_at,
    }))
}
