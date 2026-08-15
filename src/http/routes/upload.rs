use crate::auth::client_ip;
use crate::error::{ApiError, ApiResult};
use crate::files::{ensure_dir, ext_for_mime, validate_upload};
use crate::http::extractors::RequireAuth;
use crate::state::AppState;
use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::response::IntoResponse;
use axum::Json;
use serde_json::{json, Value};

pub async fn upload(
    State(st): State<AppState>,
    RequireAuth(_user): RequireAuth,
    headers: axum::http::HeaderMap,
    mut multipart: Multipart,
) -> ApiResult<Json<Value>> {
    let ip = client_ip(&headers);
    if let Err(retry) = st.limiter.check(
        "upload",
        &ip,
        std::time::Duration::from_secs(10 * 60),
        60,
    ) {
        return Err(ApiError::with_extra(
            StatusCode::TOO_MANY_REQUESTS,
            json!({ "error": "Too many requests", "retryAfter": retry }),
        )
        .with_retry(retry));
    }

    let mut file_name = None;
    let mut mime = None;
    let mut bytes = None;
    while let Some(field) = multipart.next_field().await.map_err(|_| ApiError::bad("No file provided"))? {
        if field.name() == Some("file") {
            file_name = Some(field.file_name().unwrap_or("file").to_string());
            mime = Some(field.content_type().unwrap_or("application/octet-stream").to_string());
            bytes = Some(field.bytes().await.map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Upload failed"))?.to_vec());
        }
    }
    let (Some(name), Some(declared), Some(buf)) = (file_name, mime, bytes) else {
        return Err(ApiError::bad("No file provided"));
    };
    let detected = validate_upload(&name, &declared, buf.len() as u64, st.cfg.upload_max_bytes, &buf)
        .map_err(|e| {
            if e.status == StatusCode::INTERNAL_SERVER_ERROR {
                ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Upload failed")
            } else {
                e
            }
        })?;
    let ext = ext_for_mime(detected).ok_or_else(|| ApiError::bad("Unsupported file type"))?;
    ensure_dir(&st.cfg.upload_dir)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Upload failed"))?;
    let fname = format!("{}{ext}", uuid::Uuid::new_v4());
    tokio::fs::write(st.cfg.upload_dir.join(&fname), &buf)
        .await
        .map_err(|_| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "Upload failed"))?;
    Ok(Json(json!({
        "fileUrl": format!("/uploads/{fname}"),
        "fileSize": buf.len(),
        "fileName": name,
    })))
}

pub async fn serve_upload(State(st): State<AppState>, Path(path): Path<String>) -> impl IntoResponse {
    if path.contains('\0') || path.contains("..") {
        return (StatusCode::FORBIDDEN, "Forbidden").into_response();
    }
    match crate::files::resolve_upload_path(&st.cfg, &path).await {
        Some(p) => crate::files::serve_file(p).await,
        None => StatusCode::NOT_FOUND.into_response(),
    }
}
