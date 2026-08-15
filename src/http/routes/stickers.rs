use crate::audit::log_admin_action;
use crate::db::from_doc;
use crate::db::models::{Sticker, User};
use crate::db::{new_id, now_bson, to_doc};
use crate::error::{ApiError, ApiResult};
use crate::files::ensure_dir;
use crate::http::extractors::SuperAdmin;
use crate::state::AppState;
use axum::extract::{Multipart, State};
use axum::http::{header, HeaderMap};
use axum::response::{IntoResponse, Response};
use axum::Json;
use futures_util::TryStreamExt;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};

pub async fn public_list(State(st): State<AppState>) -> Response {
    match load_public(&st).await {
        Ok(body) => {
            let mut res = Json(body).into_response();
            res.headers_mut().insert(
                header::CACHE_CONTROL,
                header::HeaderValue::from_static("public, max-age=3600"),
            );
            res
        }
        Err(e) => e.into_response(),
    }
}

async fn load_public(st: &AppState) -> ApiResult<Value> {
    let mut cursor = st
        .db
        .stickers()
        .find(doc! {})
        .sort(doc! { "uploadedAt": -1 })
        .await?;
    let mut stickers = Vec::new();
    while let Some(d) = cursor.try_next().await? {
        if let Ok(s) = from_doc::<Sticker>(d) {
            stickers.push(s.public_json());
        }
    }
    let total = stickers.len();
    Ok(json!({ "stickers": stickers, "total": total }))
}

pub async fn admin_list(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let mut cursor = st
        .db
        .stickers()
        .find(doc! {})
        .sort(doc! { "uploadedAt": -1 })
        .await?;
    let mut stickers = Vec::new();
    while let Some(d) = cursor.try_next().await? {
        if let Ok(s) = from_doc::<Sticker>(d) {
            let uploader = uploader_json(&st, &s.uploaded_by).await;
            stickers.push(s.admin_json(uploader));
        }
    }
    let total = stickers.len();
    Ok(Json(json!({ "stickers": stickers, "total": total })))
}

async fn uploader_json(st: &AppState, id: &str) -> Value {
    st.db
        .find_one::<User>(st.db.users(), doc! { "_id": id })
        .await
        .ok()
        .flatten()
        .map(|u| json!({ "username": u.username, "displayName": u.display_name }))
        .unwrap_or(json!({ "username": null, "displayName": null }))
}

pub async fn admin_upload(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    headers: HeaderMap,
    mut multipart: Multipart,
) -> ApiResult<Json<Value>> {
    let mut bytes = None;
    let mut name = String::new();
    let mut ctype = String::new();
    while let Some(field) = multipart.next_field().await.map_err(|_| ApiError::bad("noFile"))? {
        if field.name() == Some("file") {
            name = field.file_name().unwrap_or("sticker.png").to_string();
            ctype = field.content_type().unwrap_or("").to_string();
            bytes = Some(field.bytes().await.map_err(|_| ApiError::server())?.to_vec());
        }
    }
    let buf = bytes.ok_or_else(|| ApiError::bad("noFile"))?;
    if !ctype.starts_with("image/png") {
        return Err(ApiError::bad("invalidFileType"));
    }
    if buf.len() > 500 * 1024 {
        return Err(ApiError::bad("fileTooLarge"));
    }
    let dir = st.cfg.upload_dir.join("stickers");
    ensure_dir(&dir).await.map_err(|_| ApiError::server())?;
    let fname = format!("{}.png", chrono::Utc::now().timestamp_millis());
    tokio::fs::write(dir.join(&fname), &buf)
        .await
        .map_err(|_| ApiError::server())?;
    let sticker = Sticker {
        id: new_id(),
        file_url: format!("/uploads/stickers/{fname}"),
        file_name: name.clone(),
        file_size: buf.len() as i64,
        uploaded_by: admin.id.clone(),
        uploaded_at: now_bson(),
    };
    st.db.stickers().insert_one(to_doc(&sticker)?).await?;
    log_admin_action(
        &st.cfg,
        &headers,
        "POST",
        "/api/admin/stickers",
        &admin.id,
        "admin.stickers.upload",
        Some("sticker"),
        Some(&sticker.id),
        Some(json!({ "fileName": name, "fileSize": buf.len() })),
    )
    .await;
    Ok(Json(json!({ "sticker": sticker.admin_json(uploader_json(&st, &admin.id).await) })))
}

#[derive(Deserialize)]
pub struct IdBody {
    id: Option<String>,
}

pub async fn admin_delete(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    headers: HeaderMap,
    Json(body): Json<IdBody>,
) -> ApiResult<Json<Value>> {
    let id = body.id.filter(|s| !s.is_empty()).ok_or_else(|| ApiError::bad("missingId"))?;
    let Some(sticker) = st
        .db
        .find_one::<Sticker>(st.db.stickers(), doc! { "_id": &id })
        .await?
    else {
        return Err(ApiError::not_found("notFound"));
    };
    if let Some(rel) = sticker.file_url.strip_prefix("/uploads/") {
        let _ = tokio::fs::remove_file(st.cfg.upload_dir.join(rel)).await;
        let _ = tokio::fs::remove_file(std::path::PathBuf::from(format!("public{}", sticker.file_url))).await;
    }
    st.db.stickers().delete_one(doc! { "_id": &id }).await?;
    log_admin_action(
        &st.cfg,
        &headers,
        "DELETE",
        "/api/admin/stickers",
        &admin.id,
        "admin.stickers.delete",
        Some("sticker"),
        Some(&id),
        None,
    )
    .await;
    Ok(Json(json!({ "success": true })))
}
