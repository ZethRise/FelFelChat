use crate::config::Config;
use crate::db::models::User;
use crate::db::{from_doc, new_id, now_bson, to_doc, Db};
use mongodb::bson::doc;
use rand::RngCore;

pub async fn seed_superadmin(cfg: &Config, db: &Db) -> Result<(), String> {
    if let Some(existing) = db
        .users()
        .find_one(doc! { "isSuperAdmin": true })
        .await
        .map_err(|e| e.to_string())?
    {
        let user: User = from_doc(existing).map_err(|_| "bad user doc".to_string())?;
        println!("[felfel] superadmin already exists: {}", user.username);
        return Ok(());
    }

    let generated = random_password();
    let password = cfg
        .superadmin_password
        .clone()
        .unwrap_or_else(|| generated.clone());
    let hashed = bcrypt::hash(&password, 10).map_err(|e| e.to_string())?;
    let now = now_bson();
    let user = User {
        id: new_id(),
        username: cfg.superadmin_username.clone(),
        display_name: Some(cfg.superadmin_display_name.clone()),
        avatar_url: None,
        bio: None,
        password: hashed,
        is_super_admin: true,
        is_banned: false,
        created_at: now,
        last_seen: now,
    };
    db.users()
        .insert_one(to_doc(&user).map_err(|_| "encode user".to_string())?)
        .await
        .map_err(|e| e.to_string())?;

    println!("[felfel] created superadmin: {}", user.username);
    if cfg.superadmin_password.is_none() {
        println!("[felfel] generated SUPERADMIN_PASSWORD={password}");
        println!("[felfel] change this password after first login");
    }
    Ok(())
}

fn random_password() -> String {
    let mut bytes = [0u8; 12];
    rand::rng().fill_bytes(&mut bytes);
    data_encoding_base64url(&bytes)
}

fn data_encoding_base64url(bytes: &[u8]) -> String {
    const TBL: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let mut out = String::new();
    let mut i = 0;
    while i < bytes.len() {
        let b0 = bytes[i] as u32;
        let b1 = if i + 1 < bytes.len() { bytes[i + 1] as u32 } else { 0 };
        let b2 = if i + 2 < bytes.len() { bytes[i + 2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        out.push(TBL[((triple >> 18) & 63) as usize] as char);
        out.push(TBL[((triple >> 12) & 63) as usize] as char);
        if i + 1 < bytes.len() {
            out.push(TBL[((triple >> 6) & 63) as usize] as char);
        }
        if i + 2 < bytes.len() {
            out.push(TBL[(triple & 63) as usize] as char);
        }
        i += 3;
    }
    out
}

pub fn generate_strong_key() -> String {
    const CHARSET: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?";
    let mut bytes = [0u8; 64];
    rand::rng().fill_bytes(&mut bytes);
    bytes
        .iter()
        .map(|b| CHARSET[(*b as usize) % CHARSET.len()] as char)
        .collect()
}
