use crate::db::from_doc;
use crate::db::models::{KeyExchange, Message, Room, RoomMember, User};
use crate::db::{iso, new_id, now_bson, to_doc};
use crate::error::{ApiError, ApiResult};
use crate::http::extractors::{CookieAuth, RequireAuth, SuperAdmin};
use crate::seed::generate_strong_key;
use crate::state::AppState;
use axum::extract::{Multipart, Path, State};
use axum::http::StatusCode;
use axum::Json;
use futures_util::TryStreamExt;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};
use std::path::Path as FsPath;

#[derive(Deserialize)]
pub struct CreateRoom {
    name: Option<String>,
    #[serde(rename = "type")]
    r#type: Option<String>,
    #[serde(rename = "memberIds")]
    member_ids: Option<Vec<String>>,
}

#[derive(Deserialize)]
pub struct KeyAction {
    action: String,
    key: Option<String>,
}

pub async fn list_rooms(State(st): State<AppState>, CookieAuth(me): CookieAuth) -> ApiResult<Json<Value>> {
    let memberships = load_memberships(&st, &me.id).await?;
    let room_ids: Vec<String> = memberships.iter().map(|m| m.room_id.clone()).collect();
    if room_ids.is_empty() {
        return Ok(Json(json!({ "rooms": [] })));
    }
    let mut rooms_cursor = st
        .db
        .rooms()
        .find(doc! { "_id": { "$in": &room_ids } })
        .sort(doc! { "createdAt": -1 })
        .await?;
    let mut rooms = Vec::new();
    while let Some(doc) = rooms_cursor.try_next().await? {
        if let Ok(room) = from_doc::<Room>(doc) {
            rooms.push(assemble_room(&st, &room, &me.id).await?);
        }
    }
    Ok(Json(json!({ "rooms": rooms })))
}

async fn assemble_room(st: &AppState, room: &Room, me_id: &str) -> ApiResult<Value> {
    let members = member_payloads(st, &room.id).await?;
    let last = last_message(st, &room.id).await?;
    let msg_count = st
        .db
        .messages()
        .count_documents(doc! { "roomId": &room.id })
        .await?;
    let member_count = st
        .db
        .room_members()
        .count_documents(doc! { "roomId": &room.id })
        .await?;
    let membership = st
        .db
        .find_one::<RoomMember>(
            st.db.room_members(),
            doc! { "userId": me_id, "roomId": &room.id },
        )
        .await?;
    let mut unread_filter = doc! {
        "roomId": &room.id,
        "userId": { "$ne": me_id },
    };
    if let Some(last_read) = membership.and_then(|m| m.last_read_at) {
        unread_filter.insert("createdAt", doc! { "$gt": last_read });
    }
    let unread = st.db.messages().count_documents(unread_filter).await?;
    let mut obj = crate::db::models::room_json_base(room);
    obj["members"] = json!(members);
    obj["messages"] = json!(last);
    obj["_count"] = json!({ "messages": msg_count, "members": member_count });
    obj["unreadCount"] = json!(unread);
    Ok(obj)
}

async fn last_message(st: &AppState, room_id: &str) -> ApiResult<Vec<Value>> {
    let mut cursor = st
        .db
        .messages()
        .find(doc! { "roomId": room_id })
        .sort(doc! { "createdAt": -1 })
        .limit(1)
        .await?;
    let mut out = Vec::new();
    if let Some(doc) = cursor.try_next().await? {
        if let Ok(msg) = from_doc::<Message>(doc) {
            let username = st
                .db
                .find_one::<User>(st.db.users(), doc! { "_id": &msg.user_id })
                .await?
                .map(|u| u.username)
                .unwrap_or_default();
            out.push(json!({
                "text": msg.text,
                "user": { "username": username },
                "createdAt": iso(msg.created_at),
            }));
        }
    }
    Ok(out)
}

async fn member_payloads(st: &AppState, room_id: &str) -> ApiResult<Vec<Value>> {
    let mut cursor = st
        .db
        .room_members()
        .find(doc! { "roomId": room_id })
        .sort(doc! { "joinedAt": 1 })
        .await?;
    let mut out = Vec::new();
    while let Some(doc) = cursor.try_next().await? {
        if let Ok(m) = from_doc::<RoomMember>(doc) {
            let user = st
                .db
                .find_one::<User>(st.db.users(), doc! { "_id": &m.user_id })
                .await?;
            let user_json = user
                .map(|u| {
                    json!({
                        "id": u.id,
                        "username": u.username,
                        "displayName": u.display_name,
                        "lastSeen": iso(u.last_seen),
                        "avatarUrl": u.avatar_url,
                        "bio": u.bio,
                    })
                })
                .unwrap_or(json!({ "id": m.user_id }));
            out.push(json!({
                "id": m.id,
                "userId": m.user_id,
                "roomId": m.room_id,
                "joinedAt": iso(m.joined_at),
                "lastReadAt": m.last_read_at.map(iso),
                "user": user_json,
            }));
        }
    }
    Ok(out)
}

async fn load_memberships(st: &AppState, user_id: &str) -> ApiResult<Vec<RoomMember>> {
    let mut cursor = st.db.room_members().find(doc! { "userId": user_id }).await?;
    let mut out = Vec::new();
    while let Some(doc) = cursor.try_next().await? {
        if let Ok(m) = from_doc::<RoomMember>(doc) {
            out.push(m);
        }
    }
    Ok(out)
}

pub async fn create_room(
    State(st): State<AppState>,
    CookieAuth(me): CookieAuth,
    Json(body): Json<CreateRoom>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    let room_type = body.r#type.clone().unwrap_or_else(|| "GROUP".into());
    if matches!(room_type.as_str(), "GROUP" | "CHANNEL") && !me.is_super_admin {
        return Err(ApiError::forbidden());
    }
    if room_type == "PRIVATE" {
        let members = body.member_ids.clone().unwrap_or_default();
        if members.len() != 1 {
            return Err(ApiError::bad("Private chat needs exactly one other user"));
        }
        if let Some(existing) = find_private(&st, &me.id, &members[0]).await? {
            let members = member_payloads(&st, &existing.id).await?;
            let mut room = crate::db::models::room_json_base(&existing);
            room["members"] = json!(members);
            return Ok((StatusCode::OK, Json(json!({ "room": room }))));
        }
    }

    let now = now_bson();
    let room = Room {
        id: new_id(),
        name: body.name.filter(|s| !s.is_empty()).unwrap_or_else(|| "Chat".into()),
        r#type: room_type.clone(),
        profile_photo_url: None,
        created_by: me.id.clone(),
        created_at: now,
    };
    st.db.rooms().insert_one(to_doc(&room)?).await?;
    let mut member_ids = body.member_ids.unwrap_or_default();
    member_ids.push(me.id.clone());
    member_ids.sort();
    member_ids.dedup();
    for uid in &member_ids {
        let m = RoomMember {
            id: new_id(),
            user_id: uid.clone(),
            room_id: room.id.clone(),
            joined_at: now,
            last_read_at: None,
        };
        st.db.room_members().insert_one(to_doc(&m)?).await?;
    }
    for uid in &member_ids {
        st.emit_to_user(uid, "room:new", json!({ "roomId": room.id, "type": room.r#type }));
    }
    let members = member_payloads(&st, &room.id).await?;
    let mut payload = crate::db::models::room_json_base(&room);
    payload["members"] = json!(members);
    Ok((StatusCode::CREATED, Json(json!({ "room": payload }))))
}

async fn find_private(st: &AppState, a: &str, b: &str) -> ApiResult<Option<Room>> {
    let mut cursor = st.db.rooms().find(doc! { "type": "PRIVATE" }).await?;
    while let Some(doc) = cursor.try_next().await? {
        if let Ok(room) = from_doc::<Room>(doc) {
            let count_a = st
                .db
                .room_members()
                .count_documents(doc! { "roomId": &room.id, "userId": a })
                .await?;
            let count_b = st
                .db
                .room_members()
                .count_documents(doc! { "roomId": &room.id, "userId": b })
                .await?;
            if count_a > 0 && count_b > 0 {
                return Ok(Some(room));
            }
        }
    }
    Ok(None)
}

pub async fn list_members(
    State(st): State<AppState>,
    RequireAuth(me): RequireAuth,
    Path(room_id): Path<String>,
) -> ApiResult<Json<Value>> {
    if room_id.is_empty() {
        return Err(ApiError::bad("missingRoomId"));
    }
    let membership = st
        .db
        .find_one::<RoomMember>(
            st.db.room_members(),
            doc! { "userId": &me.id, "roomId": &room_id },
        )
        .await?;
    if membership.is_none() && !me.is_super_admin {
        return Err(ApiError::forbidden());
    }
    let room = st
        .db
        .find_one::<Room>(st.db.rooms(), doc! { "_id": &room_id })
        .await?;
    if room.is_none() {
        return Err(ApiError::not_found("roomNotFound"));
    }
    let members = member_payloads(&st, &room_id).await?;
    let total = members.len();
    Ok(Json(json!({ "members": members, "total": total })))
}

pub async fn leave_room(
    State(st): State<AppState>,
    RequireAuth(me): RequireAuth,
    Path(room_id): Path<String>,
) -> ApiResult<Json<Value>> {
    if room_id.is_empty() {
        return Err(ApiError::bad("missingRoomId"));
    }
    let membership = st
        .db
        .find_one::<RoomMember>(
            st.db.room_members(),
            doc! { "userId": &me.id, "roomId": &room_id },
        )
        .await?;
    if membership.is_none() {
        return Err(ApiError::not_found("Not a member"));
    }
    st.db
        .room_members()
        .delete_one(doc! { "userId": &me.id, "roomId": &room_id })
        .await?;
    let remaining = st
        .db
        .room_members()
        .count_documents(doc! { "roomId": &room_id })
        .await?;
    if remaining == 0 {
        st.db.messages().delete_many(doc! { "roomId": &room_id }).await?;
        st.db.rooms().delete_one(doc! { "_id": &room_id }).await?;
    }
    Ok(Json(json!({ "ok": true })))
}

pub async fn mark_read(
    State(st): State<AppState>,
    CookieAuth(me): CookieAuth,
    Path(room_id): Path<String>,
) -> ApiResult<Json<Value>> {
    st.db
        .room_members()
        .update_one(
            doc! { "userId": &me.id, "roomId": room_id },
            doc! { "$set": { "lastReadAt": now_bson() } },
        )
        .await?;
    Ok(Json(json!({ "ok": true })))
}

pub async fn get_key_exchange(
    State(st): State<AppState>,
    CookieAuth(me): CookieAuth,
    Path(room_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let membership = st
        .db
        .find_one::<RoomMember>(
            st.db.room_members(),
            doc! { "userId": &me.id, "roomId": &room_id },
        )
        .await?;
    if membership.is_none() {
        return Err(ApiError::forbidden());
    }
    let kx = st
        .db
        .find_one::<KeyExchange>(st.db.key_exchanges(), doc! { "roomId": &room_id })
        .await?;
    Ok(Json(json!({ "keyExchange": kx.map(|k| k.json()) })))
}

pub async fn post_key_exchange(
    State(st): State<AppState>,
    CookieAuth(me): CookieAuth,
    Path(room_id): Path<String>,
    Json(body): Json<KeyAction>,
) -> ApiResult<Json<Value>> {
    let membership = st
        .db
        .find_one::<RoomMember>(
            st.db.room_members(),
            doc! { "userId": &me.id, "roomId": &room_id },
        )
        .await?;
    if membership.is_none() {
        return Err(ApiError::forbidden());
    }
    match body.action.as_str() {
        "request" => {
            if let Some(existing) = st
                .db
                .find_one::<KeyExchange>(st.db.key_exchanges(), doc! { "roomId": &room_id })
                .await?
            {
                return Ok(Json(json!({ "keyExchange": existing.json() })));
            }
            let now = now_bson();
            let created = KeyExchange {
                id: new_id(),
                room_id: room_id.clone(),
                requester_id: me.id.clone(),
                status: "PENDING".into(),
                key: None,
                created_at: now,
                updated_at: now,
            };
            st.db.key_exchanges().insert_one(to_doc(&created)?).await?;
            st.emit_to_room(
                &room_id,
                "key_exchange:request",
                json!({ "roomId": room_id, "requesterId": me.id }),
            );
            Ok(Json(json!({ "keyExchange": created.json() })))
        }
        "accept" => {
            let mut key = body.key.unwrap_or_default();
            if key.len() < 32 {
                key = generate_strong_key();
            }
            let now = now_bson();
            let existing = st
                .db
                .find_one::<KeyExchange>(st.db.key_exchanges(), doc! { "roomId": &room_id })
                .await?;
            let updated = if let Some(mut ex) = existing {
                ex.status = "ACCEPTED".into();
                ex.key = Some(key.clone());
                ex.updated_at = now;
                st.db
                    .key_exchanges()
                    .replace_one(doc! { "roomId": &room_id }, to_doc(&ex)?)
                    .await?;
                ex
            } else {
                let created = KeyExchange {
                    id: new_id(),
                    room_id: room_id.clone(),
                    requester_id: me.id.clone(),
                    status: "ACCEPTED".into(),
                    key: Some(key.clone()),
                    created_at: now,
                    updated_at: now,
                };
                st.db.key_exchanges().insert_one(to_doc(&created)?).await?;
                created
            };
            st.emit_to_room(
                &room_id,
                "key_exchange:accept",
                json!({ "roomId": room_id, "key": key }),
            );
            Ok(Json(json!({ "keyExchange": updated.json() })))
        }
        _ => Err(ApiError::bad("Invalid action")),
    }
}

pub async fn upload_room_photo(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    Path(room_id): Path<String>,
    mut multipart: Multipart,
) -> ApiResult<Json<Value>> {
    let Some(room) = st
        .db
        .find_one::<Room>(st.db.rooms(), doc! { "_id": &room_id })
        .await?
    else {
        return Err(ApiError::not_found("roomNotFound"));
    };
    if room.r#type == "PRIVATE" {
        return Err(ApiError::bad("cannotSetPrivateRoomPhoto"));
    }
    let mut file_bytes = None;
    let mut file_name = String::new();
    let mut file_type = String::new();
    while let Some(field) = multipart.next_field().await.map_err(|_| ApiError::bad("noFile"))? {
        if field.name() == Some("file") {
            file_name = field.file_name().unwrap_or("photo.jpg").to_string();
            file_type = field.content_type().unwrap_or("").to_string();
            file_bytes = Some(field.bytes().await.map_err(|_| ApiError::server())?.to_vec());
        }
    }
    let bytes = file_bytes.ok_or_else(|| ApiError::bad("noFile"))?;
    if !file_type.starts_with("image/") {
        return Err(ApiError::bad("invalidFileType"));
    }
    if bytes.len() > 5 * 1024 * 1024 {
        return Err(ApiError::bad("fileTooLarge"));
    }
    let ext = FsPath::new(&file_name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_else(|| ".jpg".into());
    let dest_dir = st.cfg.upload_dir.join("rooms");
    crate::files::ensure_dir(&dest_dir)
        .await
        .map_err(|_| ApiError::server())?;
    let fname = format!("{room_id}_{}{ext}", chrono::Utc::now().timestamp_millis());
    tokio::fs::write(dest_dir.join(&fname), &bytes)
        .await
        .map_err(|_| ApiError::server())?;
    if let Some(old) = &room.profile_photo_url {
        if let Some(rel) = old.strip_prefix("/uploads/") {
            let _ = tokio::fs::remove_file(st.cfg.upload_dir.join(rel)).await;
            let _ = tokio::fs::remove_file(std::path::PathBuf::from("public").join(old.trim_start_matches('/'))).await;
        }
    }
    let url = format!("/uploads/rooms/{fname}");
    st.db
        .rooms()
        .update_one(doc! { "_id": &room_id }, doc! { "$set": { "profilePhotoUrl": &url } })
        .await?;
    crate::audit::log_admin_action(
        &st.cfg,
        &HeaderMap::new(),
        "POST",
        &format!("/api/rooms/{room_id}/profile-photo"),
        &admin.id,
        "admin.rooms.profile-photo.upload",
        Some("room"),
        Some(&room_id),
        None,
    )
    .await;
    let mut updated = room;
    updated.profile_photo_url = Some(url);
    Ok(Json(json!({ "room": crate::db::models::room_json_base(&updated) })))
}

use axum::http::HeaderMap;

pub async fn delete_room_photo(
    State(st): State<AppState>,
    SuperAdmin(admin): SuperAdmin,
    Path(room_id): Path<String>,
    headers: HeaderMap,
) -> ApiResult<Json<Value>> {
    let Some(mut room) = st
        .db
        .find_one::<Room>(st.db.rooms(), doc! { "_id": &room_id })
        .await?
    else {
        return Err(ApiError::not_found("roomNotFound"));
    };
    let Some(url) = room.profile_photo_url.clone() else {
        return Err(ApiError::bad("noPhotoToDelete"));
    };
    if let Some(rel) = url.strip_prefix("/uploads/") {
        let _ = tokio::fs::remove_file(st.cfg.upload_dir.join(rel)).await;
        let _ = tokio::fs::remove_file(std::path::PathBuf::from("public").join(url.trim_start_matches('/'))).await;
    }
    st.db
        .rooms()
        .update_one(doc! { "_id": &room_id }, doc! { "$set": { "profilePhotoUrl": Bson::Null } })
        .await?;
    crate::audit::log_admin_action(
        &st.cfg,
        &headers,
        "DELETE",
        &format!("/api/rooms/{room_id}/profile-photo"),
        &admin.id,
        "admin.rooms.profile-photo.delete",
        Some("room"),
        Some(&room_id),
        None,
    )
    .await;
    room.profile_photo_url = None;
    Ok(Json(json!({ "success": true, "room": crate::db::models::room_json_base(&room) })))
}

use mongodb::bson::Bson;
