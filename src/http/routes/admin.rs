use crate::audit::{log_admin_action, read_audit_logs};
use crate::backup::{
    backup_path, create_signature, dump_args, is_safe_filename, meta_name, restore_args,
    run_mongo_tool, verify_signature, write_signature,
};
use crate::db::from_doc;
use crate::db::models::{Message, Room, RoomMember, Settings, User};
use crate::db::{iso, new_id, now_bson, to_doc};
use crate::error::{ApiError, ApiResult};
use crate::files::{dir_size, format_bytes};
use crate::http::extractors::SuperAdmin;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::{HeaderMap, StatusCode};
use axum::Json;
use futures_util::TryStreamExt;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;

#[derive(Deserialize)]
pub struct AuditQ {
    limit: Option<usize>,
}

pub async fn audit(
    State(st): State<AppState>,
    SuperAdmin(_): SuperAdmin,
    Query(q): Query<AuditQ>,
) -> ApiResult<Json<Value>> {
    let limit = q.limit.unwrap_or(200).clamp(1, 1000);
    let (logs, total) = read_audit_logs(&st.cfg.audit_log_dir, limit).await;
    Ok(Json(json!({ "logs": logs, "total": total })))
}

pub async fn list_users(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let mut cursor = st.db.users().find(doc! {}).sort(doc! { "createdAt": -1 }).await?;
    let mut users = Vec::new();
    while let Some(d) = cursor.try_next().await? {
        if let Ok(u) = from_doc::<User>(d) {
            let count = st
                .db
                .messages()
                .count_documents(doc! { "userId": &u.id })
                .await?;
            users.push(json!({
                "id": u.id,
                "username": u.username,
                "displayName": u.display_name,
                "isSuperAdmin": u.is_super_admin,
                "isBanned": u.is_banned,
                "createdAt": iso(u.created_at),
                "lastSeen": iso(u.last_seen),
                "_count": { "messages": count },
            }));
        }
    }
    Ok(Json(json!({ "users": users })))
}

#[derive(Deserialize)]
pub struct UserAction {
    action: String,
    #[serde(rename = "userId")]
    user_id: Option<String>,
}

pub async fn user_action(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    headers: HeaderMap,
    Json(body): Json<UserAction>,
) -> ApiResult<Json<Value>> {
    let user_id = body.user_id.ok_or_else(|| ApiError::bad("Invalid action"))?;
    match body.action.as_str() {
        "ban" => {
            st.db
                .users()
                .update_one(doc! { "_id": &user_id }, doc! { "$set": { "isBanned": true } })
                .await?;
        }
        "unban" => {
            st.db
                .users()
                .update_one(doc! { "_id": &user_id }, doc! { "$set": { "isBanned": false } })
                .await?;
        }
        "delete" => {
            st.db.users().delete_one(doc! { "_id": &user_id }).await?;
        }
        _ => return Err(ApiError::bad("Invalid action")),
    }
    log_admin_action(
        &st.cfg,
        &headers,
        "POST",
        "/api/admin/users",
        &admin.id,
        &format!("admin.users.{}", body.action),
        Some("user"),
        Some(&user_id),
        None,
    )
    .await;
    Ok(Json(json!({ "success": true })))
}

pub async fn list_rooms(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let mut cursor = st.db.rooms().find(doc! {}).sort(doc! { "createdAt": -1 }).await?;
    let mut rooms = Vec::new();
    while let Some(d) = cursor.try_next().await? {
        if let Ok(room) = from_doc::<Room>(d) {
            rooms.push(admin_room_json(&st, &room).await?);
        }
    }
    Ok(Json(json!({ "rooms": rooms })))
}

async fn admin_room_json(st: &AppState, room: &Room) -> ApiResult<Value> {
    let mut members_c = st.db.room_members().find(doc! { "roomId": &room.id }).await?;
    let mut members = Vec::new();
    while let Some(d) = members_c.try_next().await? {
        if let Ok(m) = from_doc::<RoomMember>(d) {
            let user = st
                .db
                .find_one::<User>(st.db.users(), doc! { "_id": &m.user_id })
                .await?
                .map(|u| json!({ "id": u.id, "username": u.username, "displayName": u.display_name }))
                .unwrap_or(json!({ "id": m.user_id }));
            members.push(json!({
                "id": m.id,
                "userId": m.user_id,
                "roomId": m.room_id,
                "joinedAt": iso(m.joined_at),
                "user": user,
            }));
        }
    }
    let msg_count = st.db.messages().count_documents(doc! { "roomId": &room.id }).await?;
    let member_count = members.len();
    let mut v = crate::db::models::room_json_base(room);
    v["members"] = json!(members);
    v["_count"] = json!({ "messages": msg_count, "members": member_count });
    Ok(v)
}

#[derive(Deserialize)]
pub struct RoomAction {
    action: String,
    #[serde(rename = "roomId")]
    room_id: Option<String>,
    name: Option<String>,
    #[serde(rename = "type")]
    r#type: Option<String>,
    #[serde(rename = "userId")]
    user_id: Option<String>,
    #[serde(rename = "memberIds")]
    member_ids: Option<Vec<String>>,
}

pub async fn room_action(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    headers: HeaderMap,
    Json(body): Json<RoomAction>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    match body.action.as_str() {
        "create" => {
            let now = now_bson();
            let room = Room {
                id: new_id(),
                name: body.name.unwrap_or_else(|| "Chat".into()),
                r#type: body.r#type.unwrap_or_else(|| "GROUP".into()),
                profile_photo_url: None,
                created_by: admin.id.clone(),
                created_at: now,
            };
            st.db.rooms().insert_one(to_doc(&room)?).await?;
            let mut ids = body.member_ids.unwrap_or_default();
            ids.push(admin.id.clone());
            ids.sort();
            ids.dedup();
            for uid in &ids {
                let m = RoomMember {
                    id: new_id(),
                    user_id: uid.clone(),
                    room_id: room.id.clone(),
                    joined_at: now,
                    last_read_at: None,
                };
                st.db.room_members().insert_one(to_doc(&m)?).await?;
            }
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/rooms",
                &admin.id,
                "admin.rooms.create",
                Some("room"),
                Some(&room.id),
                Some(json!({ "type": room.r#type, "memberCount": ids.len() })),
            )
            .await;
            return Ok((StatusCode::CREATED, Json(json!({ "room": crate::db::models::room_json_base(&room) }))));
        }
        "delete" => {
            let room_id = body.room_id.ok_or_else(|| ApiError::bad("Invalid action"))?;
            st.db.messages().delete_many(doc! { "roomId": &room_id }).await?;
            st.db.room_members().delete_many(doc! { "roomId": &room_id }).await?;
            st.db.rooms().delete_one(doc! { "_id": &room_id }).await?;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/rooms",
                &admin.id,
                "admin.rooms.delete",
                Some("room"),
                Some(&room_id),
                None,
            )
            .await;
        }
        "addMember" => {
            let room_id = body.room_id.ok_or_else(|| ApiError::bad("Invalid action"))?;
            let user_id = body.user_id.ok_or_else(|| ApiError::bad("Invalid action"))?;
            let m = RoomMember {
                id: new_id(),
                user_id: user_id.clone(),
                room_id: room_id.clone(),
                joined_at: now_bson(),
                last_read_at: None,
            };
            st.db.room_members().insert_one(to_doc(&m)?).await?;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/rooms",
                &admin.id,
                "admin.rooms.addMember",
                Some("room"),
                Some(&room_id),
                Some(json!({ "userId": user_id })),
            )
            .await;
        }
        "removeMember" => {
            let room_id = body.room_id.ok_or_else(|| ApiError::bad("Invalid action"))?;
            let user_id = body.user_id.ok_or_else(|| ApiError::bad("Invalid action"))?;
            st.db
                .room_members()
                .delete_many(doc! { "userId": &user_id, "roomId": &room_id })
                .await?;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/rooms",
                &admin.id,
                "admin.rooms.removeMember",
                Some("room"),
                Some(&room_id),
                Some(json!({ "userId": user_id })),
            )
            .await;
        }
        _ => return Err(ApiError::bad("Invalid action")),
    }
    Ok((StatusCode::OK, Json(json!({ "success": true }))))
}

pub async fn room_members(
    State(st): State<AppState>,
    SuperAdmin(_): SuperAdmin,
    Path(room_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let mut cursor = st
        .db
        .room_members()
        .find(doc! { "roomId": &room_id })
        .sort(doc! { "joinedAt": 1 })
        .await?;
    let mut members = Vec::new();
    while let Some(d) = cursor.try_next().await? {
        if let Ok(m) = from_doc::<RoomMember>(d) {
            let user = st
                .db
                .find_one::<User>(st.db.users(), doc! { "_id": &m.user_id })
                .await?
                .map(|u| {
                    json!({
                        "id": u.id,
                        "username": u.username,
                        "displayName": u.display_name,
                        "isBanned": u.is_banned,
                        "lastSeen": iso(u.last_seen),
                    })
                })
                .unwrap_or(json!({ "id": m.user_id }));
            members.push(json!({
                "id": m.id,
                "userId": m.user_id,
                "joinedAt": iso(m.joined_at),
                "user": user,
            }));
        }
    }
    Ok(Json(json!({ "members": members })))
}

#[derive(Deserialize)]
pub struct MemberBody {
    #[serde(rename = "userId")]
    user_id: Option<String>,
}

pub async fn add_room_member(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    Path(room_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<MemberBody>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let user_id = body.user_id.filter(|s| !s.is_empty()).ok_or_else(|| ApiError::bad("userId required"))?;
    if st
        .db
        .find_one::<Room>(st.db.rooms(), doc! { "_id": &room_id })
        .await?
        .is_none()
    {
        return Err(ApiError::not_found("Room not found"));
    }
    if st
        .db
        .find_one::<User>(st.db.users(), doc! { "_id": &user_id })
        .await?
        .is_none()
    {
        return Err(ApiError::not_found("User not found"));
    }
    if st
        .db
        .find_one::<RoomMember>(
            st.db.room_members(),
            doc! { "userId": &user_id, "roomId": &room_id },
        )
        .await?
        .is_some()
    {
        return Err(ApiError::bad("Already a member"));
    }
    let m = RoomMember {
        id: new_id(),
        user_id: user_id.clone(),
        room_id: room_id.clone(),
        joined_at: now_bson(),
        last_read_at: None,
    };
    st.db.room_members().insert_one(to_doc(&m)?).await?;
    log_admin_action(
        &st.cfg,
        &headers,
        "POST",
        &format!("/api/admin/rooms/{room_id}/members"),
        &admin.id,
        "admin.roomMembers.add",
        Some("room"),
        Some(&room_id),
        Some(json!({ "userId": user_id })),
    )
    .await;
    Ok((StatusCode::CREATED, Json(json!({ "success": true }))))
}

pub async fn remove_room_member(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    Path(room_id): Path<String>,
    headers: HeaderMap,
    Json(body): Json<MemberBody>,
) -> ApiResult<Json<Value>> {
    let user_id = body.user_id.filter(|s| !s.is_empty()).ok_or_else(|| ApiError::bad("userId required"))?;
    if st
        .db
        .find_one::<RoomMember>(
            st.db.room_members(),
            doc! { "userId": &user_id, "roomId": &room_id },
        )
        .await?
        .is_none()
    {
        return Err(ApiError::not_found("Not a member"));
    }
    let count = st
        .db
        .room_members()
        .count_documents(doc! { "roomId": &room_id })
        .await?;
    if count <= 1 {
        return Err(ApiError::bad("Cannot remove last member"));
    }
    st.db
        .room_members()
        .delete_one(doc! { "userId": &user_id, "roomId": &room_id })
        .await?;
    log_admin_action(
        &st.cfg,
        &headers,
        "DELETE",
        &format!("/api/admin/rooms/{room_id}/members"),
        &admin.id,
        "admin.roomMembers.remove",
        Some("room"),
        Some(&room_id),
        Some(json!({ "userId": user_id })),
    )
    .await;
    Ok(Json(json!({ "success": true })))
}

pub async fn list_messages(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let mut cursor = st
        .db
        .messages()
        .find(doc! {})
        .sort(doc! { "createdAt": -1 })
        .limit(200)
        .await?;
    let mut messages = Vec::new();
    while let Some(d) = cursor.try_next().await? {
        if let Ok(m) = from_doc::<Message>(d) {
            let username = st
                .db
                .find_one::<User>(st.db.users(), doc! { "_id": &m.user_id })
                .await?
                .map(|u| u.username)
                .unwrap_or_default();
            let room_name = st
                .db
                .find_one::<Room>(st.db.rooms(), doc! { "_id": &m.room_id })
                .await?
                .map(|r| r.name)
                .unwrap_or_default();
            messages.push(json!({
                "id": m.id,
                "text": m.text,
                "fileUrl": m.file_url,
                "createdAt": iso(m.created_at),
                "user": { "username": username },
                "room": { "name": room_name },
            }));
        }
    }
    Ok(Json(json!({ "messages": messages })))
}

#[derive(Deserialize)]
pub struct MsgAction {
    action: String,
    #[serde(rename = "messageId")]
    message_id: Option<String>,
    #[serde(rename = "messageIds")]
    message_ids: Option<Vec<String>>,
}

pub async fn message_action(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    headers: HeaderMap,
    Json(body): Json<MsgAction>,
) -> ApiResult<Json<Value>> {
    match body.action.as_str() {
        "delete" => {
            if let Some(id) = &body.message_id {
                st.db.messages().delete_one(doc! { "_id": id }).await?;
            }
        }
        "deleteBulk" => {
            if let Some(ids) = &body.message_ids {
                st.db.messages().delete_many(doc! { "_id": { "$in": ids } }).await?;
            }
        }
        _ => return Err(ApiError::bad("Invalid action")),
    }
    let target = body
        .message_id
        .clone()
        .or_else(|| body.message_ids.as_ref().map(|v| v.len().to_string()));
    log_admin_action(
        &st.cfg,
        &headers,
        "POST",
        "/api/admin/messages",
        &admin.id,
        &format!("admin.messages.{}", body.action),
        Some("message"),
        target.as_deref(),
        body.message_ids.as_ref().map(|v| json!({ "count": v.len() })),
    )
    .await;
    Ok(Json(json!({ "success": true })))
}

pub async fn get_settings(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let settings = ensure_settings(&st).await?;
    Ok(Json(json!({ "settings": settings.json() })))
}

pub async fn put_settings(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    headers: HeaderMap,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let enabled = body
        .get("registrationEnabled")
        .and_then(|v| v.as_bool())
        .ok_or_else(|| ApiError::bad("Invalid data"))?;
    let now = now_bson();
    st.db
        .settings()
        .update_one(
            doc! { "_id": "default" },
            doc! { "$set": { "registrationEnabled": enabled, "updatedAt": now }, "$setOnInsert": { "_id": "default" } },
        )
        .with_options(crate::db::upsert_opts())
        .await?;
    log_admin_action(
        &st.cfg,
        &headers,
        "PUT",
        "/api/admin/settings",
        &admin.id,
        "admin.settings.update",
        Some("settings"),
        Some("default"),
        Some(json!({ "registrationEnabled": enabled })),
    )
    .await;
    let settings = Settings {
        id: "default".into(),
        registration_enabled: enabled,
        updated_at: Some(now),
    };
    Ok(Json(json!({ "settings": settings.json() })))
}

async fn ensure_settings(st: &AppState) -> ApiResult<Settings> {
    if let Some(s) = st
        .db
        .find_one::<Settings>(st.db.settings(), doc! { "_id": "default" })
        .await?
    {
        return Ok(s);
    }
    let s = Settings {
        id: "default".into(),
        registration_enabled: true,
        updated_at: Some(now_bson()),
    };
    st.db.settings().insert_one(to_doc(&s)?).await?;
    Ok(s)
}

pub async fn stats(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let total_users = st.db.users().count_documents(doc! {}).await?;
    let total_messages = st.db.messages().count_documents(doc! {}).await?;
    let total_rooms = st.db.rooms().count_documents(doc! {}).await?;
    let db_size = mongo_size(&st).await;
    let uploads = dir_size(&st.cfg.upload_dir);
    let free = disk_free();
    let online = st.online.len();
    let active = st.active_call.lock().ok().and_then(|g| g.clone());
    Ok(Json(json!({
        "totalUsers": total_users,
        "totalMessages": total_messages,
        "totalRooms": total_rooms,
        "onlineUsers": online,
        "dbSize": format_bytes(db_size),
        "uploadsSize": format_bytes(uploads),
        "freeSpace": format_bytes(free),
        "activeCall": active,
    })))
}

async fn mongo_size(st: &AppState) -> u64 {
    match st.db.inner.run_command(doc! { "dbStats": 1 }).await {
        Ok(raw) => raw
            .get("storageSize")
            .or_else(|| raw.get("dataSize"))
            .or_else(|| raw.get("totalSize"))
            .and_then(|v| v.as_i64().or_else(|| v.as_f64().map(|f| f as i64)))
            .unwrap_or(0)
            .max(0) as u64,
        Err(_) => 0,
    }
}

fn disk_free() -> u64 {
    disk_stats().2
}

fn disk_stats() -> (u64, u64, u64) {
    let out = std::process::Command::new("df")
        .args(["-B1", "."])
        .output()
        .ok();
    let Some(out) = out else { return (0, 0, 0) };
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().nth(1).unwrap_or("");
    let parts: Vec<&str> = line.split_whitespace().collect();
    let total = parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let used = parts.get(2).and_then(|s| s.parse().ok()).unwrap_or(0);
    let free = parts.get(3).and_then(|s| s.parse().ok()).unwrap_or(0);
    (total, used, free)
}

pub async fn storage_get(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let (total, used, free) = disk_stats();
    let db_size = mongo_size(&st).await;
    let mut uploads_size = 0u64;
    let mut uploads_count = 0u64;
    if let Ok(rd) = std::fs::read_dir(&st.cfg.upload_dir) {
        for e in rd.flatten() {
            if let Ok(meta) = e.metadata() {
                if meta.is_file() {
                    uploads_size += meta.len();
                    uploads_count += 1;
                }
            }
        }
    }
    let backups_size = dir_size(&st.cfg.backup_dir);
    let mut rooms_c = st.db.rooms().find(doc! {}).await?;
    let mut rooms = Vec::new();
    while let Some(d) = rooms_c.try_next().await? {
        if let Ok(r) = from_doc::<Room>(d) {
            let count = st.db.messages().count_documents(doc! { "roomId": &r.id }).await?;
            rooms.push(json!({
                "id": r.id,
                "name": r.name,
                "type": r.r#type,
                "_count": { "messages": count },
            }));
        }
    }
    Ok(Json(json!({
        "totalDisk": format_bytes(total),
        "usedDisk": format_bytes(used),
        "freeDisk": format_bytes(free),
        "freeDiskBytes": free,
        "dbSize": format_bytes(db_size),
        "uploadsSize": format_bytes(uploads_size),
        "uploadsCount": uploads_count,
        "backupsSize": format_bytes(backups_size),
        "rooms": rooms,
    })))
}

#[derive(Deserialize)]
pub struct StorageAction {
    action: String,
    params: Option<Value>,
}

pub async fn storage_post(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    headers: HeaderMap,
    Json(body): Json<StorageAction>,
) -> ApiResult<Json<Value>> {
    match body.action.as_str() {
        "delete-old-messages" => {
            let days = body
                .params
                .as_ref()
                .and_then(|p| p.get("days"))
                .and_then(|v| v.as_i64())
                .unwrap_or(30);
            let cutoff = mongodb::bson::DateTime::from_millis(
                chrono::Utc::now().timestamp_millis() - days * 86_400_000,
            );
            let mut cursor = st
                .db
                .messages()
                .find(doc! { "createdAt": { "$lt": cutoff }, "fileUrl": { "$ne": null } })
                .await?;
            while let Some(d) = cursor.try_next().await? {
                if let Ok(m) = from_doc::<Message>(d) {
                    if let Some(url) = m.file_url {
                        let path = PathBuf::from(format!(".{}", url));
                        let _ = std::fs::remove_file(path);
                    }
                }
            }
            let res = st
                .db
                .messages()
                .delete_many(doc! { "createdAt": { "$lt": cutoff } })
                .await?;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/storage",
                &admin.id,
                "admin.storage.delete-old-messages",
                Some("message"),
                None,
                Some(json!({ "days": days, "deleted": res.deleted_count })),
            )
            .await;
            Ok(Json(json!({ "deleted": res.deleted_count })))
        }
        "delete-room-content" => {
            let room_id = body
                .params
                .as_ref()
                .and_then(|p| p.get("roomId"))
                .and_then(|v| v.as_str())
                .ok_or_else(|| ApiError::bad("roomId required"))?
                .to_string();
            let mut cursor = st
                .db
                .messages()
                .find(doc! { "roomId": &room_id, "fileUrl": { "$ne": null } })
                .await?;
            while let Some(d) = cursor.try_next().await? {
                if let Ok(m) = from_doc::<Message>(d) {
                    if let Some(url) = m.file_url {
                        let _ = std::fs::remove_file(PathBuf::from(format!(".{}", url)));
                    }
                }
            }
            let res = st.db.messages().delete_many(doc! { "roomId": &room_id }).await?;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/storage",
                &admin.id,
                "admin.storage.delete-room-content",
                Some("room"),
                Some(&room_id),
                Some(json!({ "deleted": res.deleted_count })),
            )
            .await;
            Ok(Json(json!({ "deleted": res.deleted_count })))
        }
        "vacuum" => {
            let collections = [
                "User", "Room", "VoiceCall", "Settings", "Sticker", "Gif", "RoomMember", "Message",
                "CallLog", "BackupLog",
            ];
            let mut compacted = 0;
            for c in collections {
                if st.db.inner.run_command(doc! { "compact": c }).await.is_ok() {
                    compacted += 1;
                }
            }
            let _ = st.db.inner.run_command(doc! { "dbStats": 1 }).await;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/storage",
                &admin.id,
                "admin.storage.vacuum",
                Some("database"),
                Some("main"),
                Some(json!({ "compactedCollections": compacted })),
            )
            .await;
            Ok(Json(json!({ "success": true, "compactedCollections": compacted })))
        }
        _ => Err(ApiError::bad("Invalid action")),
    }
}

pub async fn backup_list(State(st): State<AppState>, SuperAdmin(_): SuperAdmin) -> ApiResult<Json<Value>> {
    let dir = &st.cfg.backup_dir;
    let mut backups = Vec::new();
    if dir.exists() {
        if let Ok(rd) = std::fs::read_dir(dir) {
            for e in rd.flatten() {
                let name = e.file_name().to_string_lossy().to_string();
                if name.ends_with(".archive.gz") || name.ends_with(".tar.gz") {
                    let meta = e.metadata().ok();
                    let size = meta.as_ref().map(|m| m.len()).unwrap_or(0);
                    let created = meta
                        .and_then(|m| m.modified().ok())
                        .map(|t| chrono::DateTime::<chrono::Utc>::from(t).to_rfc3339())
                        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
                    let signed = dir.join(meta_name(&name)).exists();
                    backups.push(json!({
                        "filename": name,
                        "size": format_bytes(size),
                        "sizeBytes": size,
                        "createdAt": created,
                        "signed": signed,
                    }));
                }
            }
        }
    }
    backups.sort_by(|a, b| {
        b.get("createdAt")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .cmp(a.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""))
    });
    let mut logs_c = st.db.backup_logs().find(doc! {}).sort(doc! { "createdAt": -1 }).limit(50).await?;
    let mut logs = Vec::new();
    while let Some(d) = logs_c.try_next().await? {
        logs.push(crate::http::routes::settings::doc_as_json(d));
    }
    Ok(Json(json!({ "backups": backups, "logs": logs })))
}

#[derive(Deserialize)]
pub struct BackupAction {
    action: String,
    filename: Option<String>,
    note: Option<String>,
}

pub async fn backup_post(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    headers: HeaderMap,
    Json(body): Json<BackupAction>,
) -> ApiResult<Json<Value>> {
    tokio::fs::create_dir_all(&st.cfg.backup_dir)
        .await
        .map_err(|_| ApiError::server())?;
    match body.action.as_str() {
        "create" => {
            let ts = chrono::Utc::now().to_rfc3339().replace([':', '.'], "-");
            let filename = format!("felfel-backup-{ts}.archive.gz");
            let path = backup_path(&st.cfg.backup_dir, &filename);
            run_mongo_tool("mongodump", &dump_args(&st.cfg.database_url, &path)).await?;
            let size = tokio::fs::metadata(&path).await.map(|m| m.len()).unwrap_or(0);
            let sig = create_signature(&st.cfg, &path, &filename).await?;
            write_signature(&st.cfg.backup_dir.join(meta_name(&filename)), &sig).await?;
            let log = doc! {
                "_id": new_id(),
                "filename": &filename,
                "size": size as i64,
                "createdAt": now_bson(),
                "note": body.note,
            };
            st.db.backup_logs().insert_one(log).await?;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/backup",
                &admin.id,
                "admin.backup.create",
                Some("backup"),
                Some(&filename),
                None,
            )
            .await;
            Ok(Json(json!({
                "success": true,
                "backup": {
                    "filename": filename,
                    "size": format_bytes(size),
                    "createdAt": chrono::Utc::now().to_rfc3339(),
                    "signed": true,
                }
            })))
        }
        "restore" => {
            let filename = body.filename.ok_or_else(|| ApiError::bad("filename required"))?;
            if !is_safe_filename(&filename) {
                return Err(ApiError::bad("Invalid filename"));
            }
            let path = backup_path(&st.cfg.backup_dir, &filename);
            let meta = st.cfg.backup_dir.join(meta_name(&filename));
            if !path.exists() {
                return Err(ApiError::not_found("Backup file not found"));
            }
            if !meta.exists() {
                return Err(ApiError::bad("Backup signature metadata not found"));
            }
            verify_signature(&st.cfg, &path, &meta, &filename).await?;
            let safety = backup_path(
                &st.cfg.backup_dir,
                &format!("pre-restore-{}.archive.gz", chrono::Utc::now().timestamp_millis()),
            );
            let _ = run_mongo_tool("mongodump", &dump_args(&st.cfg.database_url, &safety)).await;
            run_mongo_tool("mongorestore", &restore_args(&st.cfg.database_url, &path)).await?;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/backup",
                &admin.id,
                "admin.backup.restore",
                Some("backup"),
                Some(&filename),
                None,
            )
            .await;
            Ok(Json(json!({ "success": true, "message": "Restored. Restart server to apply." })))
        }
        "delete" => {
            let filename = body.filename.ok_or_else(|| ApiError::bad("filename required"))?;
            if !is_safe_filename(&filename) {
                return Err(ApiError::bad("Invalid filename"));
            }
            let path = backup_path(&st.cfg.backup_dir, &filename);
            let meta = st.cfg.backup_dir.join(meta_name(&filename));
            let _ = tokio::fs::remove_file(&path).await;
            let _ = tokio::fs::remove_file(&meta).await;
            st.db.backup_logs().delete_many(doc! { "filename": &filename }).await?;
            log_admin_action(
                &st.cfg,
                &headers,
                "POST",
                "/api/admin/backup",
                &admin.id,
                "admin.backup.delete",
                Some("backup"),
                Some(&filename),
                None,
            )
            .await;
            Ok(Json(json!({ "success": true })))
        }
        _ => Err(ApiError::bad("Invalid action")),
    }
}

#[derive(Deserialize)]
pub struct SuperadminUpdate {
    #[serde(rename = "currentPassword")]
    current_password: Option<String>,
    #[serde(rename = "newPassword")]
    new_password: Option<String>,
    #[serde(rename = "newUsername")]
    new_username: Option<String>,
    #[serde(rename = "newDisplayName")]
    new_display_name: Option<String>,
}

pub async fn get_superadmin(State(st): State<AppState>, SuperAdmin(me): SuperAdmin) -> ApiResult<Json<Value>> {
    let Some(user) = st.db.find_one::<User>(st.db.users(), doc! { "_id": &me.id }).await? else {
        return Err(ApiError::unauthorized());
    };
    Ok(Json(json!({ "user": {
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name,
        "isSuperAdmin": user.is_super_admin,
    }})))
}

pub async fn put_superadmin(
    State(st): State<AppState>,
    SuperAdmin(me): SuperAdmin,
    Json(body): Json<SuperadminUpdate>,
) -> ApiResult<Json<Value>> {
    let Some(user) = st.db.find_one::<User>(st.db.users(), doc! { "_id": &me.id }).await? else {
        return Err(ApiError::unauthorized());
    };
    let current = body
        .current_password
        .filter(|s| !s.is_empty())
        .ok_or_else(|| ApiError::bad("currentPasswordRequired"))?;
    if !bcrypt::verify(&current, &user.password).unwrap_or(false) {
        return Err(ApiError::bad("wrongPassword"));
    }
    let mut set = doc! {};
    if let Some(pw) = body.new_password.filter(|s| !s.is_empty()) {
        if pw.len() < 8 {
            return Err(ApiError::bad("passwordTooShort"));
        }
        set.insert(
            "password",
            bcrypt::hash(&pw, 12).map_err(|_| ApiError::server())?,
        );
    }
    if let Some(name) = body.new_username.filter(|s| !s.is_empty()) {
        if name.len() < 3 || !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
            return Err(ApiError::bad("invalidUsername"));
        }
        if let Some(existing) = st
            .db
            .find_one::<User>(st.db.users(), doc! { "username": &name })
            .await?
        {
            if existing.id != user.id {
                return Err(ApiError::new(StatusCode::CONFLICT, "usernameTaken"));
            }
        }
        set.insert("username", name);
    }
    if let Some(dn) = body.new_display_name {
        if dn.is_empty() {
            set.insert("displayName", mongodb::bson::Bson::Null);
        } else {
            set.insert("displayName", dn);
        }
    }
    if set.is_empty() {
        return Err(ApiError::bad("nothingToUpdate"));
    }
    st.db
        .users()
        .update_one(doc! { "_id": &user.id }, doc! { "$set": set })
        .await?;
    let updated = st
        .db
        .find_one::<User>(st.db.users(), doc! { "_id": &user.id })
        .await?
        .unwrap_or(user);
    Ok(Json(json!({ "user": {
        "id": updated.id,
        "username": updated.username,
        "displayName": updated.display_name,
        "isSuperAdmin": updated.is_super_admin,
    }})))
}
