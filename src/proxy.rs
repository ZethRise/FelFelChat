use crate::state::AppState;
use axum::body::Body;
use axum::extract::{Request, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use http_body_util::BodyExt;
use hyper_util::client::legacy::connect::HttpConnector;
use hyper_util::client::legacy::Client;
use hyper_util::rt::TokioExecutor;
use std::sync::OnceLock;

static CLIENT: OnceLock<Client<HttpConnector, Body>> = OnceLock::new();

fn client() -> &'static Client<HttpConnector, Body> {
    CLIENT.get_or_init(|| Client::builder(TokioExecutor::new()).build(HttpConnector::new()))
}

pub async fn fallback(State(st): State<AppState>, req: Request) -> Response {
    if !st.cfg.serve_frontend {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    proxy_to_next(&st, req).await
}

async fn proxy_to_next(st: &AppState, req: Request) -> Response {
    let path_and_query = req
        .uri()
        .path_and_query()
        .map(|p| p.as_str())
        .unwrap_or("/");
    let target = format!("{}{path_and_query}", st.cfg.next_origin());
    let (parts, body) = req.into_parts();
    let bytes = match body.collect().await {
        Ok(c) => c.to_bytes(),
        Err(_) => return StatusCode::BAD_GATEWAY.into_response(),
    };
    let mut builder = hyper::Request::builder().method(parts.method).uri(&target);
    for (k, v) in parts.headers.iter() {
        if k == axum::http::header::HOST {
            continue;
        }
        builder = builder.header(k, v);
    }
    let forwarded = builder.body(Body::from(bytes));
    let Ok(forwarded) = forwarded else {
        return StatusCode::BAD_GATEWAY.into_response();
    };
    match client().request(forwarded).await {
        Ok(res) => {
            let (parts, body) = res.into_parts();
            let mut response = Response::new(Body::new(body));
            *response.status_mut() = parts.status;
            *response.headers_mut() = parts.headers;
            response
        }
        Err(e) => {
            tracing::warn!(error = %e, "next proxy failed");
            (
                StatusCode::BAD_GATEWAY,
                "frontend is not running",
            )
                .into_response()
        }
    }
}

pub fn spawn_next(st: &AppState) {
    if !st.cfg.serve_frontend {
        return;
    }
    let port = st.cfg.next_internal_port.to_string();
    let host = st.cfg.next_internal_host.clone();
    let dev = st.cfg.next_dev;
    tokio::spawn(async move {
        let cwd = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let mut cmd = tokio::process::Command::new("npx");
        cmd.current_dir(&cwd);
        cmd.arg("next");
        if dev {
            cmd.arg("dev");
        } else {
            cmd.arg("start");
        }
        cmd.arg("-p").arg(&port).arg("-H").arg(&host);
        cmd.env("PORT", &port);
        cmd.env("HOSTNAME", &host);
        match cmd.spawn() {
            Ok(mut child) => {
                crate::log::info(
                    "next.child.started",
                    Some(serde_json::json!({ "host": host, "port": port, "dev": dev })),
                );
                let _ = child.wait().await;
            }
            Err(e) => {
                crate::log::error("next.child.failed", Some(serde_json::json!({ "error": e.to_string() })));
            }
        }
    });
}
