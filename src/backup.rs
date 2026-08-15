use crate::config::Config;
use crate::error::{ApiError, ApiResult};
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use tokio::process::Command;

type HmacSha256 = Hmac<Sha256>;

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupSignature {
    pub version: u32,
    pub file: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    pub sha256: String,
    #[serde(rename = "hmacSha256")]
    pub hmac_sha256: String,
}

pub fn is_safe_filename(name: &str) -> bool {
    !name.is_empty() && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

pub fn meta_name(filename: &str) -> String {
    format!("{filename}.meta.json")
}

async fn hash_file(path: &Path) -> ApiResult<String> {
    let bytes = tokio::fs::read(path).await.map_err(|_| ApiError::server())?;
    Ok(hex::encode(Sha256::digest(&bytes)))
}

fn hmac_hex(key: &str, input: &str) -> ApiResult<String> {
    let mut mac = HmacSha256::new_from_slice(key.as_bytes()).map_err(|_| ApiError::server())?;
    mac.update(input.as_bytes());
    Ok(hex::encode(mac.finalize().into_bytes()))
}

pub async fn create_signature(cfg: &Config, file_path: &Path, file_name: &str) -> ApiResult<BackupSignature> {
    if cfg.backup_signing_key.is_empty() {
        return Err(ApiError::server());
    }
    let sha = hash_file(file_path).await?;
    let hmac = hmac_hex(&cfg.backup_signing_key, &sha)?;
    Ok(BackupSignature {
        version: 1,
        file: file_name.to_string(),
        created_at: chrono::Utc::now().to_rfc3339(),
        sha256: sha,
        hmac_sha256: hmac,
    })
}

pub async fn write_signature(meta_path: &Path, sig: &BackupSignature) -> ApiResult<()> {
    let json = serde_json::to_string_pretty(sig).map_err(|_| ApiError::server())?;
    tokio::fs::write(meta_path, json).await.map_err(|_| ApiError::server())?;
    Ok(())
}

pub async fn verify_signature(cfg: &Config, file_path: &Path, meta_path: &Path, file_name: &str) -> ApiResult<()> {
    let raw = tokio::fs::read_to_string(meta_path)
        .await
        .map_err(|_| ApiError::bad("Backup signature metadata not found"))?;
    let meta: BackupSignature =
        serde_json::from_str(&raw).map_err(|_| ApiError::bad("Invalid backup signature metadata"))?;
    if meta.version != 1 || meta.file != file_name || meta.sha256.is_empty() || meta.hmac_sha256.is_empty() {
        return Err(ApiError::bad("Invalid backup signature metadata"));
    }
    let actual = hash_file(file_path).await?;
    if actual != meta.sha256 {
        return Err(ApiError::bad("Backup hash mismatch"));
    }
    let expected = hmac_hex(&cfg.backup_signing_key, &actual)?;
    if expected != meta.hmac_sha256 {
        return Err(ApiError::bad("Backup HMAC signature mismatch"));
    }
    Ok(())
}

pub async fn run_mongo_tool(binary: &str, args: &[String]) -> ApiResult<()> {
    let out = Command::new(binary)
        .args(args)
        .output()
        .await
        .map_err(|e| {
            tracing::error!(error = %e, binary, "mongo tool spawn");
            ApiError::server()
        })?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        tracing::error!(binary, stderr = %err, "mongo tool failed");
        return Err(ApiError::server());
    }
    Ok(())
}

pub fn dump_args(uri: &str, archive: &Path) -> Vec<String> {
    vec![
        format!("--uri={uri}"),
        format!("--archive={}", archive.display()),
        "--gzip".into(),
    ]
}

pub fn restore_args(uri: &str, archive: &Path) -> Vec<String> {
    vec![
        format!("--uri={uri}"),
        format!("--archive={}", archive.display()),
        "--gzip".into(),
        "--drop".into(),
    ]
}

pub fn backup_path(dir: &Path, name: &str) -> PathBuf {
    dir.join(name)
}
