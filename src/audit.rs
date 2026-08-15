use crate::auth::client_ip;
use crate::config::Config;
use axum::http::HeaderMap;
use serde_json::{json, Value};
use std::path::Path;
use tokio::io::AsyncWriteExt;

pub async fn log_admin_action(
    cfg: &Config,
    headers: &HeaderMap,
    method: &str,
    path: &str,
    admin_user_id: &str,
    action: &str,
    target_type: Option<&str>,
    target_id: Option<&str>,
    details: Option<Value>,
) {
    let dir = &cfg.audit_log_dir;
    if let Err(e) = tokio::fs::create_dir_all(dir).await {
        tracing::error!(error = %e, "audit mkdir");
        return;
    }
    let log_path = dir.join("admin-audit.log");
    let mut payload = json!({
        "timestamp": chrono::Utc::now().to_rfc3339(),
        "adminUserId": admin_user_id,
        "action": action,
        "path": path,
        "method": method,
        "ip": client_ip(headers),
        "userAgent": headers.get("user-agent").and_then(|v| v.to_str().ok()).unwrap_or("unknown"),
    });
    if let Some(t) = target_type {
        payload["targetType"] = json!(t);
    }
    if let Some(id) = target_id {
        payload["targetId"] = json!(id);
    }
    if let Some(d) = details {
        payload["details"] = d;
    }
    let line = format!("{payload}\n");
    match tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .await
    {
        Ok(mut f) => {
            if let Err(e) = f.write_all(line.as_bytes()).await {
                tracing::error!(error = %e, "audit write");
            }
        }
        Err(e) => tracing::error!(error = %e, "audit open"),
    }
}

pub async fn read_audit_logs(dir: &Path, limit: usize) -> (Vec<Value>, usize) {
    let log_path = dir.join("admin-audit.log");
    let content = match tokio::fs::read_to_string(&log_path).await {
        Ok(c) => c,
        Err(_) => return (vec![], 0),
    };
    let lines: Vec<&str> = content.lines().filter(|l| !l.is_empty()).collect();
    let total = lines.len();
    let mut logs = Vec::new();
    for line in lines.iter().rev() {
        if logs.len() >= limit {
            break;
        }
        if let Ok(v) = serde_json::from_str::<Value>(line) {
            logs.push(v);
        }
    }
    (logs, total)
}
