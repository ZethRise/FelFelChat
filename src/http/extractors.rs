use crate::auth::{client_ip, csrf_blocked, parse_token_cookie, verify_token, Claims};
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;
use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{header, HeaderMap, StatusCode};
use serde_json::json;

#[derive(Clone)]
pub struct CookieAuth(pub Claims);

#[derive(Clone)]
pub struct RequireAuth(pub Claims);

#[derive(Clone)]
pub struct SuperAdmin(pub Claims);

fn token_from_parts(parts: &Parts) -> Option<String> {
    parse_token_cookie(
        parts
            .headers
            .get(header::COOKIE)
            .and_then(|v| v.to_str().ok()),
    )
}

impl FromRequestParts<AppState> for CookieAuth {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = token_from_parts(parts).ok_or_else(ApiError::unauthorized)?;
        let claims = verify_token(&state.cfg.jwt_secret, &token).ok_or_else(ApiError::unauthorized)?;
        Ok(CookieAuth(claims))
    }
}

impl FromRequestParts<AppState> for RequireAuth {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        if csrf_blocked(
            &parts.method,
            &parts.headers,
            &state.cfg.app_origin,
            state.cfg.is_production(),
        ) {
            return Err(ApiError::csrf());
        }
        let CookieAuth(claims) = CookieAuth::from_request_parts(parts, state).await?;
        Ok(RequireAuth(claims))
    }
}

impl FromRequestParts<AppState> for SuperAdmin {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let ip = client_ip(&parts.headers);
        if let Err(retry) = state
            .limiter
            .check("admin-api", &ip, std::time::Duration::from_secs(60), 120)
        {
            return Err(ApiError::with_extra(
                StatusCode::TOO_MANY_REQUESTS,
                json!({ "error": "Too many requests", "retryAfter": retry }),
            )
            .with_retry(retry));
        }
        let RequireAuth(claims) = RequireAuth::from_request_parts(parts, state).await?;
        if !claims.is_super_admin {
            return Err(ApiError::forbidden());
        }
        Ok(SuperAdmin(claims))
    }
}

impl ApiError {
    pub fn with_retry(mut self, secs: u64) -> Self {
        self.retry_after = Some(secs);
        self
    }
}

pub fn optional_token(headers: &HeaderMap, secret: &str) -> Option<Claims> {
    let token = parse_token_cookie(headers.get(header::COOKIE).and_then(|v| v.to_str().ok()))?;
    verify_token(secret, &token)
}

pub type EmptyResult = ApiResult<()>;
