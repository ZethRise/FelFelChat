use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub id: String,
    pub username: String,
    #[serde(rename = "isSuperAdmin")]
    pub is_super_admin: bool,
    pub exp: usize,
    pub iat: usize,
}

pub fn sign_token(secret: &str, id: &str, username: &str, is_super_admin: bool) -> Result<String, jsonwebtoken::errors::Error> {
    let now = chrono::Utc::now().timestamp() as usize;
    let claims = Claims {
        id: id.to_string(),
        username: username.to_string(),
        is_super_admin,
        iat: now,
        exp: now + 60 * 60 * 24 * 7,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
}

pub fn verify_token(secret: &str, token: &str) -> Option<Claims> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .ok()
    .map(|d| d.claims)
}
