use crate::config::Config;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tokio::sync::Notify;

#[derive(Debug, Clone, serde::Serialize)]
pub struct StatusSnapshot {
    pub redis_connected: bool,
    pub redis_last_error: Option<String>,
    pub last_channel: Option<String>,
    pub last_payload_preview: Option<String>,
    pub last_osc_address: Option<String>,
    pub last_osc_error: Option<String>,
    pub last_osc_at_ms: Option<u128>,
}

pub struct AppState {
    pub config: RwLock<Config>,
    pub redis_connected: AtomicBool,
    pub redis_last_error: RwLock<Option<String>>,
    pub last_channel: RwLock<Option<String>>,
    pub last_payload_preview: RwLock<Option<String>>,
    pub last_osc_address: RwLock<Option<String>>,
    pub last_osc_error: RwLock<Option<String>>,
    pub last_osc_at_ms: RwLock<Option<u128>>,
    pub reconnect: Notify,
}

impl AppState {
    pub fn new(cfg: Config) -> Self {
        Self {
            config: RwLock::new(cfg),
            redis_connected: AtomicBool::new(false),
            redis_last_error: RwLock::new(None),
            last_channel: RwLock::new(None),
            last_payload_preview: RwLock::new(None),
            last_osc_address: RwLock::new(None),
            last_osc_error: RwLock::new(None),
            last_osc_at_ms: RwLock::new(None),
            reconnect: Notify::new(),
        }
    }

    pub fn snapshot(&self) -> StatusSnapshot {
        StatusSnapshot {
            redis_connected: self.redis_connected.load(Ordering::SeqCst),
            redis_last_error: self.redis_last_error.read().ok().and_then(|g| g.clone()),
            last_channel: self.last_channel.read().ok().and_then(|g| g.clone()),
            last_payload_preview: self
                .last_payload_preview
                .read()
                .ok()
                .and_then(|g| g.clone()),
            last_osc_address: self.last_osc_address.read().ok().and_then(|g| g.clone()),
            last_osc_error: self.last_osc_error.read().ok().and_then(|g| g.clone()),
            last_osc_at_ms: self.last_osc_at_ms.read().ok().and_then(|g| *g),
        }
    }

    pub fn set_redis_connected(&self, ok: bool) {
        self.redis_connected.store(ok, Ordering::SeqCst);
    }

    pub fn set_redis_error(&self, msg: Option<String>) {
        if let Ok(mut w) = self.redis_last_error.write() {
            *w = msg;
        }
    }

    pub fn record_incoming(&self, channel: &str, payload: &str) {
        let prev = payload.chars().take(200).collect::<String>();
        if let Ok(mut w) = self.last_channel.write() {
            *w = Some(channel.to_string());
        }
        if let Ok(mut w) = self.last_payload_preview.write() {
            *w = Some(prev);
        }
    }

    pub fn record_osc_ok(&self, address: &str) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        if let Ok(mut w) = self.last_osc_address.write() {
            *w = Some(address.to_string());
        }
        if let Ok(mut w) = self.last_osc_error.write() {
            *w = None;
        }
        if let Ok(mut w) = self.last_osc_at_ms.write() {
            *w = Some(now);
        }
    }

    pub fn record_osc_error(&self, err: String) {
        if let Ok(mut w) = self.last_osc_error.write() {
            *w = Some(err);
        }
    }
}

pub type SharedState = Arc<AppState>;
