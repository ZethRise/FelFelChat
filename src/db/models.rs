use mongodb::bson::{doc, DateTime, Document};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use super::{iso, iso_opt};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    #[serde(rename = "_id")]
    pub id: String,
    pub username: String,
    #[serde(rename = "displayName", default)]
    pub display_name: Option<String>,
    #[serde(rename = "avatarUrl", default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub bio: Option<String>,
    pub password: String,
    #[serde(rename = "isSuperAdmin", default)]
    pub is_super_admin: bool,
    #[serde(rename = "isBanned", default)]
    pub is_banned: bool,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime,
    #[serde(rename = "lastSeen")]
    pub last_seen: DateTime,
}

impl User {
    pub fn auth_json(&self) -> Value {
        json!({
            "id": self.id,
            "username": self.username,
            "displayName": self.display_name,
            "isSuperAdmin": self.is_super_admin,
        })
    }

    pub fn me_json(&self) -> Value {
        json!({
            "id": self.id,
            "username": self.username,
            "displayName": self.display_name,
            "avatarUrl": self.avatar_url,
            "bio": self.bio,
            "isSuperAdmin": self.is_super_admin,
            "isBanned": self.is_banned,
        })
    }

    pub fn profile_json(&self) -> Value {
        json!({
            "id": self.id,
            "username": self.username,
            "displayName": self.display_name,
            "avatarUrl": self.avatar_url,
            "bio": self.bio,
            "createdAt": iso(self.created_at),
            "lastSeen": iso(self.last_seen),
        })
    }

    pub fn public_brief(&self) -> Value {
        json!({
            "id": self.id,
            "username": self.username,
            "displayName": self.display_name,
            "lastSeen": iso(self.last_seen),
        })
    }

    pub fn member_user(&self) -> Value {
        json!({
            "id": self.id,
            "username": self.username,
            "displayName": self.display_name,
            "avatarUrl": self.avatar_url,
            "bio": self.bio,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: String,
    #[serde(default = "default_group")]
    pub r#type: String,
    #[serde(rename = "profilePhotoUrl", default)]
    pub profile_photo_url: Option<String>,
    #[serde(rename = "createdBy")]
    pub created_by: String,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime,
}

fn default_group() -> String {
    "GROUP".into()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoomMember {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "roomId")]
    pub room_id: String,
    #[serde(rename = "joinedAt")]
    pub joined_at: DateTime,
    #[serde(rename = "lastReadAt", default)]
    pub last_read_at: Option<DateTime>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(default)]
    pub text: Option<String>,
    #[serde(rename = "fileUrl", default)]
    pub file_url: Option<String>,
    #[serde(rename = "fileName", default)]
    pub file_name: Option<String>,
    #[serde(rename = "fileSize", default)]
    pub file_size: Option<i64>,
    #[serde(rename = "mimeType", default)]
    pub mime_type: Option<String>,
    #[serde(rename = "messageType", default = "default_text")]
    pub message_type: String,
    #[serde(rename = "userId")]
    pub user_id: String,
    #[serde(rename = "roomId")]
    pub room_id: String,
    #[serde(rename = "replyToId", default)]
    pub reply_to_id: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime,
    #[serde(rename = "readBy", default)]
    pub read_by: String,
}

fn default_text() -> String {
    "text".into()
}

impl Message {
    pub fn json_with(&self, user: Value, reply_to: Option<Value>) -> Value {
        let mut v = json!({
            "id": self.id,
            "text": self.text,
            "fileUrl": self.file_url,
            "fileName": self.file_name,
            "fileSize": self.file_size,
            "mimeType": self.mime_type,
            "messageType": self.message_type,
            "userId": self.user_id,
            "roomId": self.room_id,
            "replyToId": self.reply_to_id,
            "createdAt": iso(self.created_at),
            "readBy": self.read_by,
            "user": user,
        });
        if let Some(reply) = reply_to {
            v["replyTo"] = reply;
        }
        v
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KeyExchange {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "roomId")]
    pub room_id: String,
    #[serde(rename = "requesterId")]
    pub requester_id: String,
    #[serde(default = "default_pending")]
    pub status: String,
    #[serde(default)]
    pub key: Option<String>,
    #[serde(rename = "createdAt")]
    pub created_at: DateTime,
    #[serde(rename = "updatedAt")]
    pub updated_at: DateTime,
}

fn default_pending() -> String {
    "PENDING".into()
}

impl KeyExchange {
    pub fn json(&self) -> Value {
        json!({
            "id": self.id,
            "roomId": self.room_id,
            "requesterId": self.requester_id,
            "status": self.status,
            "key": self.key,
            "createdAt": iso(self.created_at),
            "updatedAt": iso(self.updated_at),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "registrationEnabled", default = "default_true")]
    pub registration_enabled: bool,
    #[serde(rename = "updatedAt", default)]
    pub updated_at: Option<DateTime>,
}

fn default_true() -> bool {
    true
}

impl Settings {
    pub fn json(&self) -> Value {
        json!({
            "id": self.id,
            "registrationEnabled": self.registration_enabled,
            "updatedAt": iso_opt(self.updated_at),
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sticker {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "fileUrl")]
    pub file_url: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "fileSize")]
    pub file_size: i64,
    #[serde(rename = "uploadedBy")]
    pub uploaded_by: String,
    #[serde(rename = "uploadedAt")]
    pub uploaded_at: DateTime,
}

impl Sticker {
    pub fn public_json(&self) -> Value {
        json!({
            "id": self.id,
            "fileUrl": self.file_url,
            "fileName": self.file_name,
        })
    }

    pub fn admin_json(&self, uploader: Value) -> Value {
        json!({
            "id": self.id,
            "fileUrl": self.file_url,
            "fileName": self.file_name,
            "fileSize": self.file_size,
            "uploadedBy": self.uploaded_by,
            "uploadedAt": iso(self.uploaded_at),
            "uploader": uploader,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Gif {
    #[serde(rename = "_id")]
    pub id: String,
    #[serde(rename = "fileUrl")]
    pub file_url: String,
    #[serde(rename = "fileName")]
    pub file_name: String,
    #[serde(rename = "fileSize")]
    pub file_size: i64,
    pub format: String,
    #[serde(rename = "uploadedBy")]
    pub uploaded_by: String,
    #[serde(rename = "uploadedAt")]
    pub uploaded_at: DateTime,
}

impl Gif {
    pub fn public_json(&self) -> Value {
        json!({
            "id": self.id,
            "fileUrl": self.file_url,
            "fileName": self.file_name,
            "format": self.format,
        })
    }

    pub fn admin_json(&self, uploader: Value) -> Value {
        json!({
            "id": self.id,
            "fileUrl": self.file_url,
            "fileName": self.file_name,
            "fileSize": self.file_size,
            "format": self.format,
            "uploadedBy": self.uploaded_by,
            "uploadedAt": iso(self.uploaded_at),
            "uploader": uploader,
        })
    }
}

pub fn user_from_doc(doc: &Document) -> Option<User> {
    mongodb::bson::from_document(doc.clone()).ok()
}

pub fn room_json_base(room: &Room) -> Value {
    json!({
        "id": room.id,
        "name": room.name,
        "type": room.r#type,
        "profilePhotoUrl": room.profile_photo_url,
        "createdBy": room.created_by,
        "createdAt": iso(room.created_at),
    })
}

pub fn dt_from_json(v: &Value) -> Option<DateTime> {
    v.as_str()
        .and_then(|s| DateTime::parse_rfc3339_str(s).ok())
}

pub fn id_filter(id: &str) -> Document {
    doc! { "_id": id }
}
