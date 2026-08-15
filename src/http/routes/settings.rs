use crate::db::from_doc;
use crate::db::models::Settings;
use crate::db::{new_id, now_bson, upsert_opts};
use crate::error::ApiResult;
use crate::http::extractors::RequireAuth;
use crate::state::AppState;
use axum::extract::State;
use axum::Json;
use mongodb::bson::{doc, Bson};
use serde_json::{json, Value};

pub async fn public_settings(State(st): State<AppState>) -> Json<Value> {
    match st.db.settings().find_one(doc! { "_id": "default" }).await {
        Ok(Some(doc)) => {
            let enabled = from_doc::<Settings>(doc)
                .map(|s| s.registration_enabled)
                .unwrap_or(true);
            Json(json!({ "registrationEnabled": enabled }))
        }
        _ => Json(json!({ "registrationEnabled": true })),
    }
}

pub async fn get_settings(State(st): State<AppState>, RequireAuth(user): RequireAuth) -> ApiResult<Json<Value>> {
    let settings = st
        .db
        .user_settings()
        .find_one(doc! { "userId": &user.id })
        .await?;
    Ok(Json(json!({
        "settings": settings.map(user_settings_json).unwrap_or(Value::Null)
    })))
}

pub async fn put_settings(
    State(st): State<AppState>,
    RequireAuth(user): RequireAuth,
    Json(body): Json<Value>,
) -> ApiResult<Json<Value>> {
    let mut set = doc! {};
    for key in [
        "notifications",
        "sound",
        "preview",
        "quietHoursEnabled",
        "quietHoursStart",
        "quietHoursEnd",
        "theme",
        "accentColor",
        "fontSize",
        "bubbleStyle",
        "readReceipts",
        "lastSeen",
        "screenLock",
        "autoDownload",
        "autoDownloadWiFi",
        "imageQuality",
        "enterToSend",
        "chatBackup",
        "clearCache",
    ] {
        if let Some(v) = body.get(key) {
            if let Ok(b) = mongodb::bson::to_bson(v) {
                set.insert(key, b);
            }
        }
    }
    set.insert("updatedAt", now_bson());
    let mut insert = set.clone();
    insert.insert("_id", new_id());
    insert.insert("userId", &user.id);
    insert.insert("createdAt", now_bson());

    st.db
        .user_settings()
        .update_one(
            doc! { "userId": &user.id },
            doc! { "$set": set, "$setOnInsert": { "_id": new_id(), "userId": &user.id, "createdAt": now_bson() } },
        )
        .with_options(upsert_opts())
        .await?;

    let settings = st
        .db
        .user_settings()
        .find_one(doc! { "userId": &user.id })
        .await?
        .map(user_settings_json)
        .unwrap_or(Value::Null);
    Ok(Json(json!({ "settings": settings })))
}

pub fn doc_as_json(doc: mongodb::bson::Document) -> Value {
    user_settings_json(doc)
}

fn user_settings_json(mut doc: mongodb::bson::Document) -> Value {
    if let Some(id) = doc.remove("_id") {
        doc.insert("id", id);
    }
    fn bson_to_json(b: Bson) -> Value {
        match b {
            Bson::Document(d) => {
                let mut m = serde_json::Map::new();
                for (k, v) in d {
                    m.insert(k, bson_to_json(v));
                }
                Value::Object(m)
            }
            Bson::Array(a) => Value::Array(a.into_iter().map(bson_to_json).collect()),
            Bson::String(s) => Value::String(s),
            Bson::Boolean(b) => Value::Bool(b),
            Bson::Int32(i) => json!(i),
            Bson::Int64(i) => json!(i),
            Bson::Double(f) => json!(f),
            Bson::DateTime(dt) => Value::String(crate::db::iso(dt)),
            Bson::Null => Value::Null,
            other => serde_json::to_value(other.to_string()).unwrap_or(Value::Null),
        }
    }
    bson_to_json(Bson::Document(doc))
}
