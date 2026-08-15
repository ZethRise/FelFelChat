use dashmap::DashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

#[derive(Clone)]
pub struct RateLimiter {
    buckets: Arc<DashMap<String, Bucket>>,
}

struct Bucket {
    count: u32,
    reset_at: Instant,
}

impl RateLimiter {
    pub fn new() -> Self {
        Self {
            buckets: Arc::new(DashMap::new()),
        }
    }

    pub fn check(&self, scope: &str, ip: &str, window: Duration, max: u32) -> Result<(), u64> {
        let now = Instant::now();
        if self.buckets.len() >= 5000 {
            self.buckets.retain(|_, b| now < b.reset_at);
        }
        let key = format!("{scope}:{ip}");
        let mut entry = self.buckets.entry(key).or_insert(Bucket {
            count: 0,
            reset_at: now + window,
        });
        if now >= entry.reset_at {
            entry.count = 0;
            entry.reset_at = now + window;
        }
        if entry.count >= max {
            let retry = entry.reset_at.saturating_duration_since(now).as_secs().max(1);
            return Err(retry);
        }
        entry.count += 1;
        Ok(())
    }
}

pub fn client_ip(headers: &axum::http::HeaderMap) -> String {
    if let Some(forwarded) = headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()) {
        if let Some(first) = forwarded.split(',').next() {
            let ip = first.trim();
            if !ip.is_empty() {
                return ip.to_string();
            }
        }
    }
    if let Some(real) = headers.get("x-real-ip").and_then(|v| v.to_str().ok()) {
        if !real.is_empty() {
            return real.to_string();
        }
    }
    "unknown".into()
}
