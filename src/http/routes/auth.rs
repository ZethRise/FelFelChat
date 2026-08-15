use crate::auth::{
    clear_token_header, client_ip, parse_token_cookie, set_token_header, sign_token, verify_token,
};
use crate::db::models::{Settings, User};
use crate::db::{from_doc, new_id, now_bson, to_doc, Db};
use crate::error::{ApiError, ApiResult};
use crate::state::AppState;
use axum::body::Bytes;
use axum::extract::State;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use mongodb::bson::doc;
use serde::Deserialize;
use serde_json::{json, Value};

#[derive(Deserialize)]
struct Creds {
    username: Option<String>,
    password: Option<String>,
    #[serde(rename = "displayName")]
    display_name: Option<String>,
}

fn parse_creds(headers: &HeaderMap, body: &Bytes) -> Creds {
    let ct = headers
        .get(header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");
    if ct.contains("application/json") {
        return serde_json::from_slice(body).unwrap_or(Creds {
            username: None,
            password: None,
            display_name: None,
        });
    }
    if ct.contains("application/x-www-form-urlencoded") {
        let mut username = None;
        let mut password = None;
        let mut display_name = None;
        for (k, v) in form_urlencoded::parse(body) {
            match k.as_ref() {
                "username" => username = Some(v.into_owned()),
                "password" => password = Some(v.into_owned()),
                "displayName" => display_name = Some(v.into_owned()),
                _ => {}
            }
        }
        return Creds {
            username,
            password,
            display_name,
        };
    }
    // multipart-ish fallback: scan for name="username"
    if let Ok(text) = std::str::from_utf8(body) {
        let username = capture_multipart(text, "username");
        let password = capture_multipart(text, "password");
        let display_name = capture_multipart(text, "displayName");
        if username.is_some() || password.is_some() {
            return Creds {
                username,
                password,
                display_name,
            };
        }
    }
    serde_json::from_slice(body).unwrap_or(Creds {
        username: None,
        password: None,
        display_name: None,
    })
}

fn capture_multipart(text: &str, field: &str) -> Option<String> {
    let marker = format!("name=\"{field}\"");
    let idx = text.find(&marker)?;
    let rest = &text[idx + marker.len()..];
    let rest = rest.trim_start_matches(|c| c == '\r' || c == '\n' || c == ' ' || c == '"');
    let line = rest.lines().find(|l| !l.starts_with("Content-") && !l.is_empty())?;
    let val = line.trim().trim_end_matches('\r');
    if val.is_empty() || val.starts_with("------") {
        return None;
    }
    Some(val.to_string())
}

fn auth_fail(st: &AppState, code: &str, debug: Option<String>, status: StatusCode) -> Response {
    let body = if st.cfg.debug_errors {
        if let Some(d) = debug {
            json!({ "error": code, "debug": d })
        } else {
            json!({ "error": code })
        }
    } else {
        json!({ "error": code })
    };
    (status, Json(body)).into_response()
}

pub async fn login(State(st): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let ip = client_ip(&headers);
    if let Err(retry) = st.limiter.check(
        "auth-login",
        &ip,
        std::time::Duration::from_secs(15 * 60),
        20,
    ) {
        return ApiError::with_extra(
            StatusCode::TOO_MANY_REQUESTS,
            json!({ "error": "Too many requests", "retryAfter": retry }),
        )
        .with_retry(retry)
        .into_response();
    }

    let creds = parse_creds(&headers, &body);
    let (Some(username), Some(password)) = (creds.username, creds.password) else {
        return ApiError::bad("invalidCredentials").into_response();
    };

    let result = login_inner(&st, &username, &password).await;
    match result {
        Ok(resp) => resp,
        Err((code, status, debug)) => {
            crate::log::error("api.auth.login.error", Some(json!({ "error": debug.clone().unwrap_or_default() })));
            auth_fail(&st, &code, debug, status)
        }
    }
}

async fn login_inner(st: &AppState, username: &str, password: &str) -> Result<Response, (String, StatusCode, Option<String>)> {
    let user_doc = st
        .db
        .users()
        .find_one(doc! { "username": username })
        .await
        .map_err(|e| classify_db(e))?;
    let Some(user_doc) = user_doc else {
        return Err(("invalidCredentials".into(), StatusCode::UNAUTHORIZED, None));
    };
    let user: User = from_doc(user_doc).map_err(|_| ("serverError".into(), StatusCode::INTERNAL_SERVER_ERROR, None))?;
    if user.is_banned {
        return Err(("banned".into(), StatusCode::FORBIDDEN, None));
    }
    let valid = bcrypt::verify(password, &user.password)
        .map_err(|e| ("serverError".into(), StatusCode::INTERNAL_SERVER_ERROR, Some(e.to_string())))?;
    if !valid {
        return Err(("invalidCredentials".into(), StatusCode::UNAUTHORIZED, None));
    }
    st.db
        .users()
        .update_one(doc! { "_id": &user.id }, doc! { "$set": { "lastSeen": now_bson() } })
        .await
        .map_err(|e| classify_db(e))?;

    let token = sign_token(&st.cfg.jwt_secret, &user.id, &user.username, user.is_super_admin)
        .map_err(|e| {
            if e.to_string().contains("JWT_SECRET") {
                ("jwtSecretMissing".into(), StatusCode::INTERNAL_SERVER_ERROR, Some(e.to_string()))
            } else {
                ("serverError".into(), StatusCode::INTERNAL_SERVER_ERROR, Some(e.to_string()))
            }
        })?;

    crate::log::info("api.auth.login.success", Some(json!({ "username": user.username })));
    Ok(json_with_cookie(
        json!({ "user": user.auth_json() }),
        &token,
        st.cfg.cookie_secure(),
        StatusCode::OK,
    ))
}

fn classify_db(e: mongodb::error::Error) -> (String, StatusCode, Option<String>) {
    let msg = e.to_string();
    if msg.contains("Prisma") || msg.contains("Mongo") || msg.contains("P10") || msg.contains("mongo") {
        ("databaseError".into(), StatusCode::INTERNAL_SERVER_ERROR, Some(msg))
    } else {
        ("serverError".into(), StatusCode::INTERNAL_SERVER_ERROR, Some(msg))
    }
}

pub async fn signup(State(st): State<AppState>, headers: HeaderMap, body: Bytes) -> Response {
    let ip = client_ip(&headers);
    if let Err(retry) = st.limiter.check(
        "auth-signup",
        &ip,
        std::time::Duration::from_secs(60 * 60),
        10,
    ) {
        return ApiError::with_extra(
            StatusCode::TOO_MANY_REQUESTS,
            json!({ "error": "Too many requests", "retryAfter": retry }),
        )
        .with_retry(retry)
        .into_response();
    }

    match signup_inner(&st, &headers, &body).await {
        Ok(r) => r,
        Err((code, status, debug)) => {
            crate::log::error("api.auth.signup.error", Some(json!({ "error": debug.clone().unwrap_or_default() })));
            auth_fail(&st, &code, debug, status)
        }
    }
}

async fn signup_inner(
    st: &AppState,
    headers: &HeaderMap,
    body: &Bytes,
) -> Result<Response, (String, StatusCode, Option<String>)> {
    let settings = st
        .db
        .settings()
        .find_one(doc! { "_id": "default" })
        .await
        .map_err(classify_db)?;
    if let Some(doc) = settings {
        if let Ok(s) = from_doc::<Settings>(doc) {
            if !s.registration_enabled {
                return Err(("registrationDisabled".into(), StatusCode::FORBIDDEN, None));
            }
        }
    }

    let creds = parse_creds(headers, body);
    let username = creds.username.unwrap_or_default();
    let password = creds.password.unwrap_or_default();
    if username.len() < 3 || username.len() > 20 {
        return Err(("usernameMin".into(), StatusCode::BAD_REQUEST, None));
    }
    if !username.chars().all(|c| c.is_ascii_alphanumeric() || c == '_') {
        return Err(("invalidUsername".into(), StatusCode::BAD_REQUEST, None));
    }
    if password.len() < 6 {
        return Err(("passwordMin".into(), StatusCode::BAD_REQUEST, None));
    }
    if st
        .db
        .users()
        .find_one(doc! { "username": &username })
        .await
        .map_err(classify_db)?
        .is_some()
    {
        return Err(("usernameTaken".into(), StatusCode::CONFLICT, None));
    }

    let hashed = bcrypt::hash(&password, 10)
        .map_err(|e| ("serverError".into(), StatusCode::INTERNAL_SERVER_ERROR, Some(e.to_string())))?;
    let now = now_bson();
    let user = User {
        id: new_id(),
        username: username.clone(),
        display_name: Some(creds.display_name.unwrap_or(username)),
        avatar_url: None,
        bio: None,
        password: hashed,
        is_super_admin: false,
        is_banned: false,
        created_at: now,
        last_seen: now,
    };
    st.db
        .users()
        .insert_one(to_doc(&user).map_err(|_| ("serverError".into(), StatusCode::INTERNAL_SERVER_ERROR, None))?)
        .await
        .map_err(classify_db)?;

    let token = sign_token(&st.cfg.jwt_secret, &user.id, &user.username, user.is_super_admin)
        .map_err(|e| {
            if e.to_string().contains("JWT_SECRET") {
                ("jwtSecretMissing".into(), StatusCode::INTERNAL_SERVER_ERROR, Some(e.to_string()))
            } else {
                ("serverError".into(), StatusCode::INTERNAL_SERVER_ERROR, Some(e.to_string()))
            }
        })?;
    Ok(json_with_cookie(
        json!({ "user": user.auth_json() }),
        &token,
        st.cfg.cookie_secure(),
        StatusCode::OK,
    ))
}

pub async fn me(State(st): State<AppState>, headers: HeaderMap) -> impl IntoResponse {
    let token = parse_token_cookie(headers.get(header::COOKIE).and_then(|v| v.to_str().ok()));
    let Some(token) = token else {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "user": null })));
    };
    let Some(claims) = verify_token(&st.cfg.jwt_secret, &token) else {
        return (StatusCode::UNAUTHORIZED, Json(json!({ "user": null })));
    };
    match load_user(&st.db, &claims.id).await {
        Ok(Some(user)) if !user.is_banned => (StatusCode::OK, Json(json!({ "user": user.me_json() }))),
        _ => (StatusCode::UNAUTHORIZED, Json(json!({ "user": null }))),
    }
}

pub async fn logout(State(st): State<AppState>) -> Response {
    let mut res = (StatusCode::OK, Json(json!({ "success": true }))).into_response();
    if let Ok(val) = header::HeaderValue::from_str(&clear_token_header(st.cfg.cookie_secure())) {
        res.headers_mut().insert(header::SET_COOKIE, val);
    }
    res
}

fn json_with_cookie(body: Value, token: &str, secure: bool, status: StatusCode) -> Response {
    let mut res = (status, Json(body)).into_response();
    if let Ok(val) = header::HeaderValue::from_str(&set_token_header(token, secure)) {
        res.headers_mut().insert(header::SET_COOKIE, val);
    }
    res
}

pub async fn load_user(db: &Db, id: &str) -> ApiResult<Option<User>> {
    db.find_one(db.users(), doc! { "_id": id }).await
}
