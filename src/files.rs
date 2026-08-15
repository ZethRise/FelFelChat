use crate::config::Config;
use crate::error::{ApiError, ApiResult};
use axum::body::Body;
use axum::http::{header, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use std::path::{Path, PathBuf};
use tokio::fs;

const ALLOWED_MIME: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "video/mp4",
    "application/pdf",
    "text/plain",
];

pub fn ext_for_mime(mime: &str) -> Option<&'static str> {
    match mime {
        "image/png" => Some(".png"),
        "image/jpeg" => Some(".jpg"),
        "image/gif" => Some(".gif"),
        "image/webp" => Some(".webp"),
        "video/mp4" => Some(".mp4"),
        "application/pdf" => Some(".pdf"),
        "text/plain" => Some(".txt"),
        _ => None,
    }
}

pub fn mime_for_ext(ext: &str) -> Option<&'static str> {
    match ext {
        ".png" => Some("image/png"),
        ".jpg" | ".jpeg" | ".jfif" => Some("image/jpeg"),
        ".gif" => Some("image/gif"),
        ".webp" => Some("image/webp"),
        ".mp4" => Some("video/mp4"),
        ".pdf" => Some("application/pdf"),
        ".txt" => Some("text/plain"),
        _ => None,
    }
}

pub fn detect_file_type(buffer: &[u8]) -> Option<&'static str> {
    if buffer.len() >= 8 && buffer[..8] == [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] {
        return Some("image/png");
    }
    if buffer.len() >= 3 && buffer[..3] == [0xff, 0xd8, 0xff] {
        return Some("image/jpeg");
    }
    if buffer.len() >= 6 {
        let sig = &buffer[..6];
        if sig == b"GIF87a" || sig == b"GIF89a" {
            return Some("image/gif");
        }
    }
    if buffer.len() >= 12 && &buffer[..4] == b"RIFF" && &buffer[8..12] == b"WEBP" {
        return Some("image/webp");
    }
    if buffer.len() >= 12 && &buffer[4..8] == b"ftyp" {
        return Some("video/mp4");
    }
    if buffer.len() >= 4 && &buffer[..4] == b"%PDF" {
        return Some("application/pdf");
    }
    let sample = &buffer[..buffer.len().min(512)];
    if sample.is_empty() {
        return Some("text/plain");
    }
    let suspicious = sample
        .iter()
        .filter(|b| !(32..=126).contains(*b) && **b != 9 && **b != 10 && **b != 13)
        .count();
    if (suspicious as f64) / (sample.len() as f64) < 0.05 {
        return Some("text/plain");
    }
    None
}

pub fn validate_upload(name: &str, declared_mime: &str, size: u64, max: u64, bytes: &[u8]) -> ApiResult<&'static str> {
    if size > max {
        return Err(ApiError::with_extra(
            StatusCode::PAYLOAD_TOO_LARGE,
            serde_json::json!({ "error": "File too large" }),
        ));
    }
    if !ALLOWED_MIME.contains(&declared_mime) {
        return Err(ApiError::bad("Unsupported file type"));
    }
    let ext = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_ascii_lowercase()));
    let expected = ext.as_deref().and_then(mime_for_ext);
    if let Some(ref e) = ext {
        if expected.is_none() {
            return Err(ApiError::bad("Invalid file extension"));
        }
        let _ = e;
    }
    let detected = detect_file_type(bytes).ok_or_else(|| ApiError::bad("File content does not match declared type"))?;
    if detected != declared_mime {
        return Err(ApiError::bad("File content does not match declared type"));
    }
    if let Some(exp) = expected {
        if exp != detected {
            return Err(ApiError::bad("File extension does not match file content"));
        }
    }
    Ok(detected)
}

pub fn safe_join(root: &Path, relative: &str) -> Option<PathBuf> {
    if relative.is_empty() || relative.contains('\0') {
        return None;
    }
    let normalized = PathBuf::from(relative.replace('\\', "/"));
    if normalized
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir | std::path::Component::RootDir))
    {
        return None;
    }
    let joined = root.join(&normalized);
    let canon_root = root.canonicalize().ok()?;
    match joined.canonicalize() {
        Ok(canon) if canon.starts_with(&canon_root) => Some(canon),
        _ => {
            if joined.starts_with(root) {
                Some(joined)
            } else {
                None
            }
        }
    }
}

pub async fn resolve_upload_path(cfg: &Config, relative: &str) -> Option<PathBuf> {
    let primary = cfg.upload_dir.join(relative);
    if let Some(p) = existing_file(&cfg.upload_dir, relative) {
        return Some(p);
    }
    if tokio::fs::try_exists(&primary).await.ok()? && primary.is_file() {
        return Some(primary);
    }
    let public = PathBuf::from("public/uploads");
    if let Some(p) = existing_file(&public, relative) {
        return Some(p);
    }
    None
}

fn existing_file(root: &Path, relative: &str) -> Option<PathBuf> {
    let joined = root.join(relative);
    if joined.is_file() {
        Some(joined)
    } else {
        None
    }
}

pub fn content_type_for_path(path: &Path) -> &'static str {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{}", e.to_ascii_lowercase()))
        .as_deref()
        .and_then(mime_for_ext)
        .unwrap_or("application/octet-stream")
}

pub async fn serve_file(path: PathBuf) -> Response {
    match fs::read(&path).await {
        Ok(bytes) => {
            let mut res = Response::new(Body::from(bytes));
            let ct = content_type_for_path(&path);
            res.headers_mut()
                .insert(header::CONTENT_TYPE, HeaderValue::from_static(ct));
            res
        }
        Err(_) => StatusCode::NOT_FOUND.into_response(),
    }
}

pub async fn ensure_dir(path: &Path) -> std::io::Result<()> {
    fs::create_dir_all(path).await
}

pub fn format_bytes(bytes: u64) -> String {
    if bytes == 0 {
        return "0 B".into();
    }
    let k = 1024f64;
    let sizes = ["B", "KB", "MB", "GB"];
    let i = ((bytes as f64).ln() / k.ln()).floor() as usize;
    let i = i.min(sizes.len() - 1);
    format!("{:.1} {}", bytes as f64 / k.powi(i as i32), sizes[i])
}

pub fn dir_size(path: &Path) -> u64 {
    fn walk(p: &Path) -> u64 {
        let mut total = 0;
        if let Ok(rd) = std::fs::read_dir(p) {
            for e in rd.flatten() {
                let path = e.path();
                if path.is_file() {
                    total += e.metadata().map(|m| m.len()).unwrap_or(0);
                } else if path.is_dir() {
                    total += walk(&path);
                }
            }
        }
        total
    }
    if path.exists() {
        walk(path)
    } else {
        0
    }
}
