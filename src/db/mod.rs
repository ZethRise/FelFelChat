pub mod models;

use mongodb::bson::{doc, Document};
use mongodb::options::{ClientOptions, IndexOptions, ReplaceOptions, UpdateOptions};
use mongodb::{Client, Collection, Database, IndexModel};
use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::config::Config;
use crate::error::{ApiError, ApiResult};

#[derive(Clone)]
pub struct Db {
    pub inner: Database,
}

impl Db {
    pub async fn connect(cfg: &Config) -> Result<Self, String> {
        let mut opts = ClientOptions::parse(&cfg.database_url)
            .await
            .map_err(|e| format!("DATABASE_URL parse failed: {e}"))?;
        opts.app_name = Some("felfel-server".into());
        let client = Client::with_options(opts).map_err(|e| e.to_string())?;
        let name = client
            .default_database()
            .map(|d| d.name().to_string())
            .unwrap_or_else(|| "felfelchat".into());
        let db = client.database(&name);
        Ok(Self { inner: db })
    }

    pub async fn ping(&self) -> Result<(), mongodb::error::Error> {
        self.inner.run_command(doc! { "ping": 1 }).await?;
        Ok(())
    }

    pub async fn ensure_indexes(&self) -> Result<(), mongodb::error::Error> {
        unique_index(self.users(), "username").await?;
        compound_unique(self.room_members(), doc! { "userId": 1, "roomId": 1 }).await?;
        unique_index(self.key_exchanges(), "roomId").await?;
        unique_index(self.user_settings(), "userId").await?;
        plain_index(self.messages(), "roomId").await?;
        plain_index(self.messages(), "userId").await?;
        plain_index(self.messages(), "replyToId").await?;
        plain_index(self.stickers(), "uploadedBy").await?;
        plain_index(self.stickers(), "uploadedAt").await?;
        plain_index(self.gifs(), "uploadedBy").await?;
        plain_index(self.gifs(), "uploadedAt").await?;
        Ok(())
    }

    pub fn users(&self) -> Collection<Document> {
        self.inner.collection("User")
    }
    pub fn rooms(&self) -> Collection<Document> {
        self.inner.collection("Room")
    }
    pub fn room_members(&self) -> Collection<Document> {
        self.inner.collection("RoomMember")
    }
    pub fn messages(&self) -> Collection<Document> {
        self.inner.collection("Message")
    }
    pub fn key_exchanges(&self) -> Collection<Document> {
        self.inner.collection("KeyExchange")
    }
    pub fn settings(&self) -> Collection<Document> {
        self.inner.collection("Settings")
    }
    pub fn user_settings(&self) -> Collection<Document> {
        self.inner.collection("UserSettings")
    }
    pub fn stickers(&self) -> Collection<Document> {
        self.inner.collection("Sticker")
    }
    pub fn gifs(&self) -> Collection<Document> {
        self.inner.collection("Gif")
    }
    pub fn backup_logs(&self) -> Collection<Document> {
        self.inner.collection("BackupLog")
    }

    pub async fn find_one<T: DeserializeOwned + Unpin + Send + Sync>(
        &self,
        col: Collection<Document>,
        filter: Document,
    ) -> ApiResult<Option<T>> {
        match col.find_one(filter).await? {
            Some(doc) => Ok(Some(from_doc(doc)?)),
            None => Ok(None),
        }
    }
}

pub fn from_doc<T: DeserializeOwned>(doc: Document) -> ApiResult<T> {
    mongodb::bson::from_document(doc).map_err(|e| {
        tracing::error!(error = %e, "bson decode");
        ApiError::server()
    })
}

pub fn to_doc<T: Serialize>(value: &T) -> ApiResult<Document> {
    mongodb::bson::to_document(value).map_err(|e| {
        tracing::error!(error = %e, "bson encode");
        ApiError::server()
    })
}

pub fn now_bson() -> mongodb::bson::DateTime {
    mongodb::bson::DateTime::now()
}

pub fn iso(dt: mongodb::bson::DateTime) -> String {
    dt.try_to_rfc3339_string()
        .unwrap_or_else(|_| dt.to_string())
}

pub fn iso_opt(dt: Option<mongodb::bson::DateTime>) -> Option<String> {
    dt.map(iso)
}

pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

async fn unique_index(col: Collection<Document>, field: &str) -> Result<(), mongodb::error::Error> {
    let opts = IndexOptions::builder().unique(true).build();
    col.create_index(
        IndexModel::builder()
            .keys(doc! { field: 1 })
            .options(opts)
            .build(),
    )
    .await?;
    Ok(())
}

async fn compound_unique(
    col: Collection<Document>,
    keys: Document,
) -> Result<(), mongodb::error::Error> {
    let opts = IndexOptions::builder().unique(true).build();
    col.create_index(IndexModel::builder().keys(keys).options(opts).build())
        .await?;
    Ok(())
}

async fn plain_index(col: Collection<Document>, field: &str) -> Result<(), mongodb::error::Error> {
    col.create_index(IndexModel::builder().keys(doc! { field: 1 }).build())
        .await?;
    Ok(())
}

pub fn replace_opts() -> ReplaceOptions {
    ReplaceOptions::builder().upsert(true).build()
}

pub fn upsert_opts() -> UpdateOptions {
    UpdateOptions::builder().upsert(true).build()
}
