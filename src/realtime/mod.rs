use crate::auth::{parse_token_cookie, verify_token, Claims};
use crate::db::from_doc;
use crate::db::models::{Message, Room, RoomMember};
use crate::state::AppState;
use serde::Deserialize;
use serde_json::{json, Value};
use socketioxide::extract::{Data, SocketRef, State, TryData};
use socketioxide::handler::ConnectHandler;
use socketioxide::SocketIo;
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use std::time::Duration;

#[derive(Deserialize, Default)]
struct HandshakeAuth {
    token: Option<String>,
}

#[derive(Deserialize)]
struct RoomIdObj {
    #[serde(rename = "roomId")]
    room_id: String,
}

#[derive(Deserialize)]
struct KeyReq {
    #[serde(rename = "roomId")]
    room_id: String,
}

#[derive(Deserialize)]
struct KeyAccept {
    #[serde(rename = "roomId")]
    room_id: String,
    key: Option<Value>,
}

#[derive(Deserialize)]
struct ReadMsg {
    #[serde(rename = "messageId")]
    message_id: String,
    #[serde(rename = "roomId")]
    room_id: String,
}

#[derive(Deserialize)]
struct CallInit {
    #[serde(rename = "calleeId")]
    callee_id: String,
}

#[derive(Deserialize)]
struct LogId {
    #[serde(rename = "logId")]
    log_id: String,
}

#[derive(Deserialize)]
struct Signal {
    #[serde(rename = "targetUserId")]
    target_user_id: String,
    signal: Value,
}

pub fn build_io(state: AppState) -> (socketioxide::layer::SocketIoLayer, SocketIo) {
    let (layer, io) = SocketIo::builder()
        .ping_interval(Duration::from_millis(25_000))
        .ping_timeout(Duration::from_millis(20_000))
        .connect_timeout(Duration::from_millis(45_000))
        .with_state(state.clone())
        .build_layer();

    let io_clone = io.clone();
    io.ns(
        "/",
        (move |s: SocketRef, State(st): State<AppState>| {
            let io = io_clone.clone();
            async move {
                on_connect(s, st, io).await;
            }
        })
        .with(connect_auth),
    );

    (layer, io)
}

async fn connect_auth(
    s: SocketRef,
    TryData(auth): TryData<HandshakeAuth>,
    State(st): State<AppState>,
) -> Result<(), String> {
    let mut token = auth.ok().and_then(|a| a.token).filter(|t| !t.trim().is_empty());
    if token.is_none() {
        let cookie = s
            .req_parts()
            .headers
            .get(http::header::COOKIE)
            .and_then(|v| v.to_str().ok());
        token = parse_token_cookie(cookie);
    }
    let Some(token) = token else {
        crate::log::warn("socket.auth.failed", Some(json!({ "reason": "no_token" })));
        return Err("No token".into());
    };
    match verify_token(&st.cfg.jwt_secret, token.trim()) {
        Some(claims) => {
            s.extensions.insert(claims);
            Ok(())
        }
        None => {
            crate::log::warn("socket.auth.error", Some(json!({ "error": "invalid token" })));
            Err("Auth error: invalid token".into())
        }
    }
}

async fn on_connect(s: SocketRef, st: AppState, io: SocketIo) {
    let Some(user) = s.extensions.get::<Claims>() else {
        return;
    };
    let user_id = user.id.clone();
    let username = user.username.clone();
    crate::log::info(
        "socket.connected",
        Some(json!({ "userId": user_id, "username": username })),
    );
    st.online.insert(user_id.clone(), s.id.to_string());
    let _ = s.join(format!("user:{user_id}"));
    let _ = io.emit("user:online", &user_id);

    if user.is_super_admin {
        let _ = s.join("superadmin");
        if let Ok(guard) = st.active_call.lock() {
            if let Some(call) = guard.clone() {
                let _ = s.emit("call:started", &call);
            }
        }
        let _ = s.emit("admin:onlineCount", &st.online.len());
    }

    let joined: Arc<Mutex<HashSet<String>>> = Arc::new(Mutex::new(HashSet::new()));

    {
        let st = st.clone();
        let uid = user_id.clone();
        let joined = joined.clone();
        s.on("room:join", async move |s: SocketRef, Data(room_id): Data<String>| {
            if room_id.is_empty() {
                return;
            }
            if !is_member(&st, &uid, &room_id).await {
                let _ = s.emit("error", &"Forbidden");
                return;
            }
            if let Ok(mut j) = joined.lock() {
                j.insert(room_id.clone());
            }
            let _ = s.join(format!("room:{room_id}"));
        });
    }
    {
        let joined = joined.clone();
        s.on("room:leave", async move |s: SocketRef, Data(room_id): Data<String>| {
            if let Ok(mut j) = joined.lock() {
                j.remove(&room_id);
            }
            let _ = s.leave(format!("room:{room_id}"));
        });
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let uname = username.clone();
        let io = io.clone();
        s.on("message:send", async move |s: SocketRef, Data(data): Data<Value>| {
            let Some(room_id) = data.get("roomId").and_then(|v| v.as_str()).map(|s| s.to_string()) else {
                return;
            };
            if !is_member(&st, &uid, &room_id).await {
                let _ = s.emit("error", &"Forbidden");
                return;
            }
            crate::log::info("socket.message.send", Some(json!({ "userId": uid, "roomId": room_id })));
            let mut payload = data;
            payload["userId"] = json!(uid);
            payload["username"] = json!(uname);
            payload["createdAt"] = json!(chrono::Utc::now().to_rfc3339());
            let _ = io.to(format!("room:{room_id}")).emit("message:new", &payload);
            crate::log::info("socket.message.broadcast", Some(json!({ "roomId": room_id })));
        });
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let uname = username.clone();
        let joined = joined.clone();
        s.on("message:typing", async move |s: SocketRef, Data(room_id): Data<String>| {
            if room_id.is_empty() {
                return;
            }
            if joined.lock().map(|j| !j.contains(&room_id)).unwrap_or(true) {
                return;
            }
            if !is_member(&st, &uid, &room_id).await {
                return;
            }
            let _ = s.to(format!("room:{room_id}")).emit("message:typing", &uname);
        });
    }
    {
        let uid = user_id.clone();
        s.on(
            "key_exchange:request",
            async move |s: SocketRef, Data(body): Data<KeyReq>| {
                if body.room_id.is_empty() {
                    return;
                }
                let _ = s.to(format!("room:{}", body.room_id)).emit(
                    "key_exchange:request",
                    &json!({ "roomId": body.room_id, "requesterId": uid }),
                );
            },
        );
    }
    {
        let io = io.clone();
        s.on(
            "key_exchange:accept",
            async move |_s: SocketRef, Data(body): Data<KeyAccept>| {
                if body.room_id.is_empty() {
                    return;
                }
                let _ = io.to(format!("room:{}", body.room_id)).emit(
                    "key_exchange:accept",
                    &json!({ "roomId": body.room_id, "key": body.key }),
                );
            },
        );
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let joined = joined.clone();
        let io = io.clone();
        s.on("message:read", async move |_s: SocketRef, Data(body): Data<ReadMsg>| {
            if body.room_id.is_empty() || body.message_id.is_empty() {
                return;
            }
            if joined.lock().map(|j| !j.contains(&body.room_id)).unwrap_or(true) {
                return;
            }
            if !is_member(&st, &uid, &body.room_id).await {
                return;
            }
            if let Ok(Some(mut msg)) = st
                .db
                .find_one::<Message>(st.db.messages(), mongodb::bson::doc! { "_id": &body.message_id })
                .await
            {
                if msg.room_id != body.room_id {
                    return;
                }
                let mut set: HashSet<String> = msg
                    .read_by
                    .split(',')
                    .map(|s| s.trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();
                set.insert(uid.clone());
                let next: String = set.into_iter().collect::<Vec<_>>().join(",");
                if next != msg.read_by {
                    msg.read_by = next.clone();
                    let _ = st
                        .db
                        .messages()
                        .update_one(
                            mongodb::bson::doc! { "_id": &body.message_id },
                            mongodb::bson::doc! { "$set": { "readBy": &next } },
                        )
                        .await;
                }
                let _ = io.to(format!("room:{}", body.room_id)).emit(
                    "message:read",
                    &json!({ "messageId": body.message_id, "userId": uid, "readBy": next }),
                );
            }
        });
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let joined = joined.clone();
        s.on("room:read", async move |s: SocketRef, Data(body): Data<RoomIdObj>| {
            if body.room_id.is_empty() {
                return;
            }
            if joined.lock().map(|j| !j.contains(&body.room_id)).unwrap_or(true) {
                return;
            }
            let _ = st
                .db
                .room_members()
                .update_one(
                    mongodb::bson::doc! { "userId": &uid, "roomId": &body.room_id },
                    mongodb::bson::doc! { "$set": { "lastReadAt": crate::db::now_bson() } },
                )
                .await;
            let _ = s.emit("room:read:ack", &json!({ "roomId": body.room_id }));
        });
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let uname = username.clone();
        let io = io.clone();
        s.on("call:initiate", async move |s: SocketRef, Data(body): Data<CallInit>| {
            if st.active_call.lock().map(|g| g.is_some()).unwrap_or(true) {
                let _ = s.emit("call:error", &"A call is already active. Please wait.");
                return;
            }
            if body.callee_id.is_empty() {
                let _ = s.emit("call:error", &"Invalid callee");
                return;
            }
            if !has_private_room(&st, &uid, &body.callee_id).await {
                let _ = s.emit("call:error", &"No private room with target user");
                return;
            }
            let log_id = format!("call-{}", chrono::Utc::now().timestamp_millis());
            let call = json!({
                "callerId": uid,
                "calleeId": body.callee_id,
                "logId": log_id,
                "callerName": uname,
                "startedAt": chrono::Utc::now().to_rfc3339(),
            });
            if let Ok(mut g) = st.active_call.lock() {
                *g = Some(call.clone());
            }
            let _ = s.emit("call:initiated", &json!({ "logId": log_id, "calleeId": body.callee_id }));
            let _ = io.to(format!("user:{}", body.callee_id)).emit(
                "call:incoming",
                &json!({ "callerId": uid, "callerName": uname, "logId": log_id }),
            );
            let _ = io.to("superadmin").emit("call:started", &call);
        });
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let io = io.clone();
        s.on("call:accept", async move |_s: SocketRef, Data(body): Data<LogId>| {
            let mut updated = None;
            if let Ok(mut g) = st.active_call.lock() {
                if let Some(call) = g.as_mut() {
                    if call.get("logId").and_then(|v| v.as_str()) == Some(body.log_id.as_str()) {
                        let parties = [
                            call.get("callerId").and_then(|v| v.as_str()).unwrap_or(""),
                            call.get("calleeId").and_then(|v| v.as_str()).unwrap_or(""),
                        ];
                        if parties.contains(&uid.as_str()) {
                            call["status"] = json!("ACTIVE");
                            updated = Some(call.clone());
                        }
                    }
                }
            }
            if let Some(call) = updated {
                if let Some(caller) = call.get("callerId").and_then(|v| v.as_str()) {
                    let _ = io
                        .to(format!("user:{caller}"))
                        .emit("call:accepted", &json!({ "logId": body.log_id }));
                }
                let _ = io.to("superadmin").emit("call:updated", &call);
            }
        });
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let io = io.clone();
        s.on("call:end", async move |_s: SocketRef, Data(body): Data<LogId>| {
            end_call(&st, &io, &uid, &body.log_id, "ENDED");
        });
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let io = io.clone();
        s.on("call:reject", async move |_s: SocketRef, Data(body): Data<LogId>| {
            end_call(&st, &io, &uid, &body.log_id, "REJECTED");
        });
    }
    {
        let st = st.clone();
        let uid = user_id.clone();
        let io = io.clone();
        s.on("call:signal", async move |_s: SocketRef, Data(body): Data<Signal>| {
            let Ok(guard) = st.active_call.lock() else { return };
            let Some(call) = guard.as_ref() else { return };
            let parties = [
                call.get("callerId").and_then(|v| v.as_str()).unwrap_or(""),
                call.get("calleeId").and_then(|v| v.as_str()).unwrap_or(""),
            ];
            if !parties.contains(&uid.as_str()) || !parties.contains(&body.target_user_id.as_str()) {
                return;
            }
            let _ = io.to(format!("user:{}", body.target_user_id)).emit(
                "call:signal",
                &json!({ "fromUserId": uid, "signal": body.signal }),
            );
        });
    }
    {
        let st = st.clone();
        let user = user.clone();
        let io = io.clone();
        s.on("call:terminate", async move |s: SocketRef, Data(body): Data<LogId>| {
            if !user.is_super_admin {
                let _ = s.emit("error", &"Forbidden");
                return;
            }
            end_call(&st, &io, &user.id, &body.log_id, "TERMINATED");
        });
    }

    {
        let st = st.clone();
        let uid = user_id.clone();
        let io = io.clone();
        s.on_disconnect(async move || {
            st.online.remove(&uid);
            let _ = io.emit("user:offline", &uid);
            let _ = io.to("superadmin").emit("admin:onlineCount", &st.online.len());
            let log_id = st.active_call.lock().ok().and_then(|g| {
                g.as_ref().and_then(|c| {
                    let parties = [
                        c.get("callerId").and_then(|v| v.as_str()).unwrap_or(""),
                        c.get("calleeId").and_then(|v| v.as_str()).unwrap_or(""),
                    ];
                    if parties.contains(&uid.as_str()) {
                        c.get("logId").and_then(|v| v.as_str()).map(|s| s.to_string())
                    } else {
                        None
                    }
                })
            });
            if let Some(log_id) = log_id {
                end_call(&st, &io, &uid, &log_id, "ENDED");
            }
        });
    }
}

fn end_call(st: &AppState, io: &SocketIo, user_id: &str, log_id: &str, status: &str) {
    let ended = {
        let Ok(mut g) = st.active_call.lock() else { return };
        let Some(call) = g.as_ref() else { return };
        if call.get("logId").and_then(|v| v.as_str()) != Some(log_id) {
            return;
        }
        let parties = [
            call.get("callerId").and_then(|v| v.as_str()).unwrap_or(""),
            call.get("calleeId").and_then(|v| v.as_str()).unwrap_or(""),
        ];
        if !parties.contains(&user_id) && status != "TERMINATED" {
            // terminate already checked superadmin
        }
        if status != "TERMINATED" && !parties.contains(&user_id) {
            return;
        }
        let mut ended = call.clone();
        ended["status"] = json!(status);
        ended["endedAt"] = json!(chrono::Utc::now().to_rfc3339());
        let caller = parties[0].to_string();
        let callee = parties[1].to_string();
        *g = None;
        Some((ended, caller, callee))
    };
    if let Some((ended, caller, callee)) = ended {
        let payload = json!({ "logId": log_id, "status": status });
        let _ = io.to(format!("user:{caller}")).emit("call:ended", &payload);
        let _ = io.to(format!("user:{callee}")).emit("call:ended", &payload);
        let _ = io.to("superadmin").emit("call:ended", &ended);
    }
}

async fn is_member(st: &AppState, user_id: &str, room_id: &str) -> bool {
    st.db
        .find_one::<RoomMember>(
            st.db.room_members(),
            mongodb::bson::doc! { "userId": user_id, "roomId": room_id },
        )
        .await
        .ok()
        .flatten()
        .is_some()
}

async fn has_private_room(st: &AppState, a: &str, b: &str) -> bool {
    let Ok(mut cursor) = st.db.rooms().find(mongodb::bson::doc! { "type": "PRIVATE" }).await else {
        return false;
    };
    use futures_util::TryStreamExt;
    while let Ok(Some(d)) = cursor.try_next().await {
        if let Ok(room) = from_doc::<Room>(d) {
            let ca = st
                .db
                .room_members()
                .count_documents(mongodb::bson::doc! { "roomId": &room.id, "userId": a })
                .await
                .unwrap_or(0);
            let cb = st
                .db
                .room_members()
                .count_documents(mongodb::bson::doc! { "roomId": &room.id, "userId": b })
                .await
                .unwrap_or(0);
            if ca > 0 && cb > 0 {
                return true;
            }
        }
    }
    false
}
