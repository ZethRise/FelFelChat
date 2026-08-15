use crate::auth::RateLimiter;
use crate::config::Config;
use crate::db::Db;
use dashmap::DashMap;
use serde_json::Value;
use socketioxide::SocketIo;
use std::sync::{Arc, Mutex, OnceLock};

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<Config>,
    pub db: Db,
    pub limiter: RateLimiter,
    pub online: Arc<DashMap<String, String>>,
    pub active_call: Arc<Mutex<Option<Value>>>,
    pub io: Arc<OnceLock<SocketIo>>,
}

impl AppState {
    pub fn new(cfg: Config, db: Db) -> Self {
        Self {
            cfg: Arc::new(cfg),
            db,
            limiter: RateLimiter::new(),
            online: Arc::new(DashMap::new()),
            active_call: Arc::new(Mutex::new(None)),
            io: Arc::new(OnceLock::new()),
        }
    }

    pub fn set_io(&self, io: SocketIo) {
        let _ = self.io.set(io);
    }

    pub fn emit_to_user(&self, user_id: &str, event: &str, data: Value) {
        if let Some(io) = self.io.get() {
            let room = format!("user:{user_id}");
            let _ = io.to(room).emit(event, &data);
        }
    }

    pub fn emit_to_room(&self, room_id: &str, event: &str, data: Value) {
        if let Some(io) = self.io.get() {
            let room = format!("room:{room_id}");
            let _ = io.to(room).emit(event, &data);
        }
    }

    pub fn emit_superadmin(&self, event: &str, data: Value) {
        if let Some(io) = self.io.get() {
            let _ = io.to("superadmin").emit(event, &data);
        }
    }
}
