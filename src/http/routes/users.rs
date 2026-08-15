use crate::db::from_doc;
use crate::db::models::User;
use crate::error::{ApiError, ApiResult};
use crate::http::extractors::CookieAuth;
use crate::state::AppState;
use axum::extract::{Path, Query, State};
use axum::Json;
use futures_util::TryStreamExt;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
pub struct SearchQ {
    search: Option<String>,
}

pub async fn list_users(
    State(st): State<AppState>,
    CookieAuth(me): CookieAuth,
    Query(q): Query<SearchQ>,
) -> ApiResult<Json<Value>> {
    let mut filter = doc! {
        "_id": { "$ne": &me.id },
        "isBanned": false,
    };
    if let Some(search) = q.search.filter(|s| !s.is_empty()) {
        filter.insert(
            "$or",
            vec![
                doc! { "username": { "$regex": &search, "$options": "i" } },
                doc! { "displayName": { "$regex": &search, "$options": "i" } },
            ],
        );
    }
    let mut cursor = st
        .db
        .users()
        .find(filter)
        .sort(doc! { "username": 1 })
        .limit(50)
        .await?;
    let mut users = Vec::new();
    while let Some(doc) = cursor.try_next().await? {
        if let Ok(u) = from_doc::<User>(doc) {
            users.push(u.public_brief());
        }
    }
    Ok(Json(json!({ "users": users })))
}

pub async fn get_user(
    State(st): State<AppState>,
    CookieAuth(_me): CookieAuth,
    Path(user_id): Path<String>,
) -> ApiResult<Json<Value>> {
    let Some(user) = st
        .db
        .find_one::<User>(st.db.users(), doc! { "_id": user_id })
        .await?
    else {
        return Err(ApiError::not_found("User not found"));
    };
    Ok(Json(json!({ "profile": user.profile_json() })))
}
