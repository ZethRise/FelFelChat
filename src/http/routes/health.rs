use crate::state::AppState;
use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde_json::{json, Value};

pub async fn health() -> Json<Value> {
    Json(json!({
        "status": "ok",
        "timestamp": chrono::Utc::now().to_rfc3339(),
    }))
}

pub async fn ready(State(st): State<AppState>) -> (StatusCode, Json<Value>) {
    let mut checks = json!({
        "env": { "ok": true },
        "database": { "ok": true },
        "uploadsDir": { "ok": true },
        "backupDir": { "ok": true },
    });

    let mut missing = Vec::new();
    if st.cfg.jwt_secret.is_empty() {
        missing.push("JWT_SECRET");
    }
    if st.cfg.app_origin.is_empty() {
        missing.push("APP_ORIGIN");
    }
    if st.cfg.backup_signing_key.is_empty() {
        missing.push("BACKUP_SIGNING_KEY");
    }
    if !missing.is_empty() {
        checks["env"] = json!({ "ok": false, "detail": format!("Missing env vars: {}", missing.join(", ")) });
    }

    if let Err(e) = st.db.ping().await {
        checks["database"] = json!({ "ok": false, "detail": e.to_string() });
    }

    for (key, dir) in [("uploadsDir", &st.cfg.upload_dir), ("backupDir", &st.cfg.backup_dir)] {
        if let Err(e) = tokio::fs::create_dir_all(dir).await {
            checks[key] = json!({ "ok": false, "detail": e.to_string() });
            continue;
        }
        let probe = dir.join(".write-check");
        match tokio::fs::write(&probe, b"ok").await {
            Ok(()) => {
                let _ = tokio::fs::remove_file(&probe).await;
            }
            Err(e) => {
                checks[key] = json!({ "ok": false, "detail": e.to_string() });
            }
        }
    }

    let all_ok = checks
        .as_object()
        .map(|m| m.values().all(|v| v.get("ok").and_then(|x| x.as_bool()) == Some(true)))
        .unwrap_or(false);

    let status = if all_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };
    (
        status,
        Json(json!({
            "status": if all_ok { "ready" } else { "not-ready" },
            "timestamp": chrono::Utc::now().to_rfc3339(),
            "checks": checks,
        })),
    )
}
