use crate::db::models::User;
use crate::error::{ApiError, ApiResult};
use crate::http::extractors::CookieAuth;
use crate::state::AppState;
use axum::extract::State;
use axum::Json;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
pub struct ProfileUpdate {
    #[serde(rename = "displayName")]
    display_name: Option<String>,
    #[serde(rename = "avatarUrl")]
    avatar_url: Option<String>,
    bio: Option<String>,
}

pub async fn get_profile(State(st): State<AppState>, CookieAuth(user): CookieAuth) -> ApiResult<Json<Value>> {
    let Some(profile) = st
        .db
        .find_one::<User>(st.db.users(), doc! { "_id": &user.id })
        .await?
    else {
        return Err(ApiError::not_found("User not found"));
    };
    Ok(Json(json!({ "profile": profile.profile_json() })))
}

pub async fn put_profile(
    State(st): State<AppState>,
    CookieAuth(user): CookieAuth,
    Json(body): Json<ProfileUpdate>,
) -> ApiResult<Json<Value>> {
    if let Some(bio) = &body.bio {
        if bio.len() > 200 {
            return Err(ApiError::bad("Bio must be 200 characters or less"));
        }
    }
    let display = body.display_name.filter(|s| !s.is_empty());
    let avatar = body.avatar_url.filter(|s| !s.is_empty());
    let bio = body.bio.filter(|s| !s.is_empty());
    st.db
        .users()
        .update_one(
            doc! { "_id": &user.id },
            doc! { "$set": {
                "displayName": display.clone(),
                "avatarUrl": avatar.clone(),
                "bio": bio.clone(),
            }},
        )
        .await?;
    Ok(Json(json!({
        "profile": {
            "id": user.id,
            "username": user.username,
            "displayName": display,
            "avatarUrl": avatar,
            "bio": bio,
        }
    })))
}
