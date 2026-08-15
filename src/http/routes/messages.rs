use crate::db::from_doc;
use crate::db::models::{Message, Room, RoomMember, User};
use crate::db::{iso, new_id, now_bson, to_doc};
use crate::error::{ApiError, ApiResult};
use crate::http::extractors::CookieAuth;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::Json;
use futures_util::TryStreamExt;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
pub struct PageQ {
    cursor: Option<String>,
    limit: Option<i64>,
}

#[derive(Deserialize)]
pub struct SendBody {
    text: Option<String>,
    #[serde(rename = "fileUrl")]
    file_url: Option<String>,
    #[serde(rename = "fileName")]
    file_name: Option<String>,
    #[serde(rename = "fileSize")]
    file_size: Option<i64>,
    #[serde(rename = "mimeType")]
    mime_type: Option<String>,
    #[serde(rename = "messageType")]
    message_type: Option<String>,
    #[serde(rename = "replyToId")]
    reply_to_id: Option<String>,
}

pub async fn list_messages(
    State(st): State<AppState>,
    CookieAuth(me): CookieAuth,
    Path(room_id): Path<String>,
    Query(q): Query<PageQ>,
) -> ApiResult<Json<Value>> {
    require_member(&st, &me.id, &room_id).await?;
    let limit = q.limit.unwrap_or(50).clamp(1, 100);
    let mut filter = doc! { "roomId": &room_id };
    if let Some(cursor) = q.cursor {
        if let Some(cur) = st
            .db
            .find_one::<Message>(st.db.messages(), doc! { "_id": &cursor })
            .await?
        {
            filter.insert("createdAt", doc! { "$lt": cur.created_at });
        }
    }
    let mut cursor = st
        .db
        .messages()
        .find(filter)
        .sort(doc! { "createdAt": -1 })
        .limit(limit + 1)
        .await?;
    let mut rows = Vec::new();
    while let Some(doc) = cursor.try_next().await? {
        if let Ok(msg) = from_doc::<Message>(doc) {
            rows.push(msg);
        }
    }
    let has_more = rows.len() as i64 > limit;
    if has_more {
        rows.pop();
    }
    rows.reverse();
    let next_cursor = if has_more {
        rows.first().map(|m| m.id.clone())
    } else {
        None
    };
    let mut messages = Vec::new();
    for msg in rows {
        messages.push(hydrate_message(&st, &msg).await?);
    }
    Ok(Json(json!({ "messages": messages, "nextCursor": next_cursor })))
}

pub async fn send_message(
    State(st): State<AppState>,
    CookieAuth(me): CookieAuth,
    Path(room_id): Path<String>,
    Json(body): Json<SendBody>,
) -> ApiResult<(StatusCode, Json<Value>)> {
    require_member(&st, &me.id, &room_id).await?;
    let Some(room) = st
        .db
        .find_one::<Room>(st.db.rooms(), doc! { "_id": &room_id })
        .await?
    else {
        return Err(ApiError::not_found("Room not found"));
    };
    if room.r#type == "CHANNEL" && !me.is_super_admin {
        return Err(ApiError::new(
            StatusCode::FORBIDDEN,
            "Only superadmin can post in channels",
        ));
    }
    let msg_type = body.message_type.unwrap_or_else(|| "text".into());
    if !matches!(msg_type.as_str(), "text" | "file" | "sticker" | "gif") {
        return Err(ApiError::bad("Invalid message type"));
    }
    if msg_type == "sticker" || msg_type == "gif" {
        if body.file_url.as_ref().filter(|s| !s.is_empty()).is_none() {
            return Err(ApiError::bad("Sticker/GIF requires fileUrl"));
        }
    } else if body.text.as_ref().filter(|s| !s.is_empty()).is_none()
        && body.file_url.as_ref().filter(|s| !s.is_empty()).is_none()
    {
        return Err(ApiError::bad("Message cannot be empty"));
    }
    if let Some(text) = &body.text {
        if !text.is_empty() && !text.starts_with("hush:v1:") {
            return Err(ApiError::bad("End-to-end encryption required"));
        }
        if text.len() > 12000 {
            return Err(ApiError::bad("Message too long"));
        }
    }
    if let Some(reply_id) = &body.reply_to_id {
        let reply = st
            .db
            .find_one::<Message>(st.db.messages(), doc! { "_id": reply_id })
            .await?;
        if reply.as_ref().map(|m| m.room_id.as_str()) != Some(room_id.as_str()) {
            return Err(ApiError::bad("Invalid reply target"));
        }
    }

    let msg = Message {
        id: new_id(),
        text: body.text.filter(|s| !s.is_empty()),
        file_url: body.file_url.filter(|s| !s.is_empty()),
        file_name: body.file_name.filter(|s| !s.is_empty()),
        file_size: body.file_size,
        mime_type: body.mime_type.filter(|s| !s.is_empty()),
        message_type: msg_type,
        user_id: me.id.clone(),
        room_id: room_id.clone(),
        reply_to_id: body.reply_to_id.filter(|s| !s.is_empty()),
        created_at: now_bson(),
        read_by: String::new(),
    };
    st.db.messages().insert_one(to_doc(&msg)?).await?;
    let hydrated = hydrate_message(&st, &msg).await?;

    let mut members = st.db.room_members().find(doc! { "roomId": &room_id }).await?;
    while let Some(doc) = members.try_next().await? {
        if let Ok(m) = from_doc::<RoomMember>(doc) {
            if m.user_id != me.id {
                st.emit_to_user(
                    &m.user_id,
                    "message:new",
                    json!({ "roomId": room_id, "message": hydrated }),
                );
            }
        }
    }
    Ok((StatusCode::CREATED, Json(json!({ "message": hydrated }))))
}

async fn require_member(st: &AppState, user_id: &str, room_id: &str) -> ApiResult<RoomMember> {
    st.db
        .find_one::<RoomMember>(
            st.db.room_members(),
            doc! { "userId": user_id, "roomId": room_id },
        )
        .await?
        .ok_or_else(|| ApiError::new(StatusCode::FORBIDDEN, "Not a member"))
}

pub async fn hydrate_message(st: &AppState, msg: &Message) -> ApiResult<Value> {
    let user = st
        .db
        .find_one::<User>(st.db.users(), doc! { "_id": &msg.user_id })
        .await?
        .map(|u| {
            json!({
                "id": u.id,
                "username": u.username,
                "displayName": u.display_name,
                "avatarUrl": u.avatar_url,
            })
        })
        .unwrap_or(json!({ "id": msg.user_id, "username": "", "displayName": null, "avatarUrl": null }));
    let reply = if let Some(rid) = &msg.reply_to_id {
        if let Some(r) = st
            .db
            .find_one::<Message>(st.db.messages(), doc! { "_id": rid })
            .await?
        {
            let ru = st
                .db
                .find_one::<User>(st.db.users(), doc! { "_id": &r.user_id })
                .await?
                .map(|u| {
                    json!({
                        "id": u.id,
                        "username": u.username,
                        "displayName": u.display_name,
                        "avatarUrl": u.avatar_url,
                    })
                })
                .unwrap_or(json!({ "id": r.user_id }));
            Some(json!({
                "id": r.id,
                "text": r.text,
                "fileUrl": r.file_url,
                "fileName": r.file_name,
                "mimeType": r.mime_type,
                "userId": r.user_id,
                "replyToId": r.reply_to_id,
                "createdAt": iso(r.created_at),
                "user": ru,
            }))
        } else {
            None
        }
    } else {
        None
    };
    Ok(msg.json_with(user, reply))
}
