use crate::audit::log_admin_action;
use crate::db::from_doc;
use crate::db::models::{Gif, User};
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
    let mut cursor = st.db.gifs().find(doc! {}).sort(doc! { "uploadedAt": -1 }).await?;
    let mut gifs = Vec::new();
    while let Some(d) = cursor.try_next().await? {
        if let Ok(g) = from_doc::<Gif>(d) {
            gifs.push(g.public_json());
        }
    }
    let total = gifs.len();
    Ok(json!({ "gifs": gifs, "total": total }))
}

pub async fn admin_list(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let mut cursor = st.db.gifs().find(doc! {}).sort(doc! { "uploadedAt": -1 }).await?;
    let mut gifs = Vec::new();
    while let Some(d) = cursor.try_next().await? {
        if let Ok(g) = from_doc::<Gif>(d) {
            let uploader = uploader_json(&st, &g.uploaded_by).await;
            gifs.push(g.admin_json(uploader));
        }
    }
    let total = gifs.len();
    Ok(Json(json!({ "gifs": gifs, "total": total })))
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
            name = field.file_name().unwrap_or("gif").to_string();
            ctype = field.content_type().unwrap_or("").to_string();
            bytes = Some(field.bytes().await.map_err(|_| ApiError::server())?.to_vec());
        }
    }
    let buf = bytes.ok_or_else(|| ApiError::bad("noFile"))?;
    if ctype != "video/mp4" && ctype != "image/gif" {
        return Err(ApiError::bad("invalidFileType"));
    }
    if buf.len() > 2 * 1024 * 1024 {
        return Err(ApiError::bad("fileTooLarge"));
    }
    let dir = st.cfg.upload_dir.join("gifs");
    ensure_dir(&dir).await.map_err(|_| ApiError::server())?;
    let ext = if ctype == "video/mp4" { ".mp4" } else { ".gif" };
    let fname = format!("{}{ext}", chrono::Utc::now().timestamp_millis());
    tokio::fs::write(dir.join(&fname), &buf)
        .await
        .map_err(|_| ApiError::server())?;
    let gif = Gif {
        id: new_id(),
        file_url: format!("/uploads/gifs/{fname}"),
        file_name: name.clone(),
        file_size: buf.len() as i64,
        format: if ctype == "video/mp4" { "mp4".into() } else { "gif".into() },
        uploaded_by: admin.id.clone(),
        uploaded_at: now_bson(),
    };
    st.db.gifs().insert_one(to_doc(&gif)?).await?;
    log_admin_action(
        &st.cfg,
        &headers,
        "POST",
        "/api/admin/gifs",
        &admin.id,
        "admin.gifs.upload",
        Some("gif"),
        Some(&gif.id),
        Some(json!({ "fileName": name, "fileSize": buf.len(), "format": gif.format })),
    )
    .await;
    Ok(Json(json!({ "gif": gif.admin_json(uploader_json(&st, &admin.id).await) })))
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
    let Some(gif) = st.db.find_one::<Gif>(st.db.gifs(), doc! { "_id": &id }).await? else {
        return Err(ApiError::not_found("notFound"));
    };
    if let Some(rel) = gif.file_url.strip_prefix("/uploads/") {
        let _ = tokio::fs::remove_file(st.cfg.upload_dir.join(rel)).await;
        let _ = tokio::fs::remove_file(std::path::PathBuf::from(format!("public{}", gif.file_url))).await;
    }
    st.db.gifs().delete_one(doc! { "_id": &id }).await?;
    log_admin_action(
        &st.cfg,
        &headers,
        "DELETE",
        "/api/admin/gifs",
        &admin.id,
        "admin.gifs.delete",
        Some("gif"),
        Some(&id),
        None,
    )
    .await;
    Ok(Json(json!({ "success": true })))
}
