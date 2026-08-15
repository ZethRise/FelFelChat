pub mod extractors;
pub mod routes;

use crate::auth::parse_token_cookie;
use crate::state::AppState;
use axum::extract::Request;
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::{get, post};
use axum::Router;
use serde_json::json;

pub fn api_router() -> Router<AppState> {
    Router::new()
        .route("/health", get(routes::health::health))
        .route("/ready", get(routes::health::ready))
        .route("/settings/public", get(routes::settings::public_settings))
        .route("/auth/login", post(routes::auth::login))
        .route("/auth/signup", post(routes::auth::signup))
        .route("/auth/me", get(routes::auth::me))
        .route("/auth/logout", post(routes::auth::logout))
        .route("/profile", get(routes::profile::get_profile).put(routes::profile::put_profile))
        .route("/users", get(routes::users::list_users))
        .route("/users/{user_id}", get(routes::users::get_user))
        .route("/rooms", get(routes::rooms::list_rooms).post(routes::rooms::create_room))
        .route(
            "/rooms/{room_id}/members",
            get(routes::rooms::list_members).delete(routes::rooms::leave_room),
        )
        .route("/rooms/{room_id}/read", post(routes::rooms::mark_read))
        .route(
            "/rooms/{room_id}/key-exchange",
            get(routes::rooms::get_key_exchange).post(routes::rooms::post_key_exchange),
        )
        .route(
            "/rooms/{room_id}/profile-photo",
            post(routes::rooms::upload_room_photo).delete(routes::rooms::delete_room_photo),
        )
        .route(
            "/messages/{room_id}",
            get(routes::messages::list_messages).post(routes::messages::send_message),
        )
        .route("/upload", post(routes::upload::upload))
        .route("/settings", get(routes::settings::get_settings).put(routes::settings::put_settings))
        .route("/stickers", get(routes::stickers::public_list))
        .route("/gifs", get(routes::gifs::public_list))
        .route("/admin/audit", get(routes::admin::audit))
        .route("/admin/users", get(routes::admin::list_users).post(routes::admin::user_action))
        .route("/admin/rooms", get(routes::admin::list_rooms).post(routes::admin::room_action))
        .route(
            "/admin/rooms/{room_id}/members",
            get(routes::admin::room_members)
                .post(routes::admin::add_room_member)
                .delete(routes::admin::remove_room_member),
        )
        .route(
            "/admin/messages",
            get(routes::admin::list_messages).post(routes::admin::message_action),
        )
        .route(
            "/admin/settings",
            get(routes::admin::get_settings).put(routes::admin::put_settings),
        )
        .route("/admin/stats", get(routes::admin::stats))
        .route(
            "/admin/storage",
            get(routes::admin::storage_get).post(routes::admin::storage_post),
        )
        .route(
            "/admin/backup",
            get(routes::admin::backup_list).post(routes::admin::backup_post),
        )
        .route(
            "/admin/superadmin",
            get(routes::admin::get_superadmin).put(routes::admin::put_superadmin),
        )
        .route(
            "/admin/stickers",
            get(routes::stickers::admin_list)
                .post(routes::stickers::admin_upload)
                .delete(routes::stickers::admin_delete),
        )
        .route(
            "/admin/gifs",
            get(routes::gifs::admin_list)
                .post(routes::gifs::admin_upload)
                .delete(routes::gifs::admin_delete),
        )
}

pub fn app_router(state: AppState) -> Router {
    Router::new()
        .nest("/api", api_router())
        .route("/uploads/{*path}", get(routes::upload::serve_upload))
        .fallback(crate::proxy::fallback)
        .layer(middleware::from_fn_with_state(state.clone(), gate))
        .layer(middleware::from_fn(security_headers))
        .layer(middleware::from_fn(inject_cookie_ext))
        .with_state(state)
}

async fn inject_cookie_ext(mut req: Request, next: Next) -> Response {
    if let Some(cookie) = req.headers().get(header::COOKIE).cloned() {
        req.extensions_mut().insert(CookieHeader(cookie));
    }
    next.run(req).await
}

#[derive(Clone)]
pub struct CookieHeader(pub HeaderValue);

async fn security_headers(req: Request, next: Next) -> Response {
    let production = req
        .extensions()
        .get::<AppState>()
        .map(|s| s.cfg.is_production())
        .unwrap_or(false);
    let path = req.uri().path().to_string();
    let mut res = next.run(req).await;
    let headers = res.headers_mut();
    headers.insert("X-Content-Type-Options", HeaderValue::from_static("nosniff"));
    headers.insert("X-Frame-Options", HeaderValue::from_static("DENY"));
    headers.insert(
        "Referrer-Policy",
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        "Permissions-Policy",
        HeaderValue::from_static("camera=(), geolocation=(), microphone=(self)"),
    );
    headers.insert(
        "Cross-Origin-Resource-Policy",
        HeaderValue::from_static("same-site"),
    );
    headers.insert(
        "Content-Security-Policy",
        HeaderValue::from_static(
            "default-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; \
             img-src 'self' data: blob:; media-src 'self' blob:; \
             font-src 'self' https://fonts.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; \
             script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com; \
             connect-src 'self' ws: wss: http: https: stun: turn: turns: https://cloudflareinsights.com",
        ),
    );
    if production {
        headers.insert(
            "Strict-Transport-Security",
            HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
        );
    }
    if path.starts_with("/_next/static/") {
        headers.insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("no-store, must-revalidate"),
        );
        headers.insert(header::PRAGMA, HeaderValue::from_static("no-cache"));
    }
    res
}

async fn gate(state: axum::extract::State<AppState>, req: Request, next: Next) -> Response {
    let path = req.uri().path().to_string();
    if is_public(&path) || is_static(&path) || path.starts_with("/uploads/") || path.starts_with("/socket.io") {
        return next.run(req).await;
    }
    let token = parse_token_cookie(req.headers().get(header::COOKIE).and_then(|v| v.to_str().ok()));
    if token.is_none() {
        if path == "/api" || path.starts_with("/api/") {
            return (
                StatusCode::UNAUTHORIZED,
                axum::Json(json!({ "error": "unauthorized", "user": null })),
            )
                .into_response();
        }
        if !state.cfg.serve_frontend {
            return next.run(req).await;
        }
        return Redirect::temporary("/login").into_response();
    }
    let _ = state;
    next.run(req).await
}

fn is_public(path: &str) -> bool {
    const PUBLIC: &[&str] = &[
        "/login",
        "/signup",
        "/api/auth",
        "/api/health",
        "/api/ready",
        "/api/settings/public",
    ];
    PUBLIC.iter().any(|p| path == *p || path.starts_with(&format!("{p}/")))
}

fn is_static(path: &str) -> bool {
    path.starts_with("/_next/")
        || path.starts_with("/favicon")
        || path.starts_with("/icons/")
        || path.ends_with(".ico")
        || path.ends_with(".png")
        || path.ends_with(".jpg")
        || path.ends_with(".svg")
        || path.ends_with(".webp")
        || path.ends_with(".woff2")
        || path.ends_with(".woff")
        || path.ends_with(".js")
        || path.ends_with(".css")
        || path.ends_with(".map")
}


