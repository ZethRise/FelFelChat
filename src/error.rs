use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::Json;
use serde_json::{json, Value};

#[derive(Debug)]
pub struct ApiError {
    pub status: StatusCode,
    pub body: Value,
    pub retry_after: Option<u64>,
}

impl ApiError {
    pub fn new(status: StatusCode, code: &str) -> Self {
        Self {
            status,
            body: json!({ "error": code }),
            retry_after: None,
        }
    }

    pub fn with_extra(status: StatusCode, body: Value) -> Self {
        Self {
            status,
            body,
            retry_after: None,
        }
    }

    pub fn unauthorized() -> Self {
        Self::new(StatusCode::UNAUTHORIZED, "Unauthorized")
    }

    pub fn forbidden() -> Self {
        Self::new(StatusCode::FORBIDDEN, "Forbidden")
    }

    pub fn csrf() -> Self {
        Self::new(StatusCode::FORBIDDEN, "Forbidden (CSRF)")
    }

    pub fn server() -> Self {
        Self::new(StatusCode::INTERNAL_SERVER_ERROR, "serverError")
    }

    pub fn not_found(code: &str) -> Self {
        Self::new(StatusCode::NOT_FOUND, code)
    }

    pub fn bad(code: &str) -> Self {
        Self::new(StatusCode::BAD_REQUEST, code)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut res = (self.status, Json(self.body)).into_response();
        if let Some(secs) = self.retry_after {
            if let Ok(val) = axum::http::HeaderValue::from_str(&secs.to_string()) {
                res.headers_mut().insert(axum::http::header::RETRY_AFTER, val);
            }
        }
        res
    }
}

impl From<mongodb::error::Error> for ApiError {
    fn from(err: mongodb::error::Error) -> Self {
        tracing::error!(error = %err, "mongodb error");
        Self::server()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;
