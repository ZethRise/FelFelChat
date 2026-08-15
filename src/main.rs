mod audit;
mod auth;
mod backup;
mod config;
mod db;
mod error;
mod files;
mod http;
mod log;
mod proxy;
mod realtime;
mod seed;
mod state;

use crate::config::Config;
use crate::db::Db;
use crate::state::AppState;
use serde_json::json;

#[tokio::main]
async fn main() {
    let _ = dotenvy::dotenv();
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(|s| s.as_str()).unwrap_or("serve");

    let cfg = match Config::from_env() {
        Ok(c) => c,
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(1);
        }
    };

    let db = match Db::connect(&cfg).await {
        Ok(db) => db,
        Err(e) => {
            crate::log::error("db.connect.failed", Some(json!({ "error": e })));
            std::process::exit(1);
        }
    };

    if let Err(e) = db.ensure_indexes().await {
        crate::log::warn("db.indexes.failed", Some(json!({ "error": e.to_string() })));
    }

    match cmd {
        "seed-superadmin" => {
            if let Err(e) = seed::seed_superadmin(&cfg, &db).await {
                eprintln!("[felfel] seed failed: {e}");
                std::process::exit(1);
            }
        }
        _ => {
            if let Err(e) = seed::seed_superadmin(&cfg, &db).await {
                crate::log::warn("seed.failed", Some(json!({ "error": e })));
            }
            serve(cfg, db).await;
        }
    }
}

async fn serve(cfg: Config, db: Db) {
    let _ = tokio::fs::create_dir_all(&cfg.upload_dir).await;
    let _ = tokio::fs::create_dir_all(&cfg.backup_dir).await;
    let _ = tokio::fs::create_dir_all(&cfg.audit_log_dir).await;

    let state = AppState::new(cfg.clone(), db);
    let (sio_layer, io) = realtime::build_io(state.clone());
    state.set_io(io);
    crate::proxy::spawn_next(&state);

    let app = crate::http::app_router(state.clone()).layer(sio_layer);

    let addr = format!("{}:{}", cfg.bind_host, cfg.port);
    let listener = match tokio::net::TcpListener::bind(&addr).await {
        Ok(l) => l,
        Err(e) => {
            crate::log::error("server.bind.failed", Some(json!({ "error": e.to_string(), "addr": addr })));
            std::process::exit(1);
        }
    };
    crate::log::info("server.started", Some(json!({ "url": format!("http://{addr}") })));
    if let Err(e) = axum::serve(listener, app).await {
        crate::log::error("server.exit", Some(json!({ "error": e.to_string() })));
        std::process::exit(1);
    }
}
