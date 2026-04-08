use crate::config::Config;
use crate::farrago::{FarragoBoard, FarragoBoardSnapshot};
use rosc::OscType;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, RwLock};
use tokio::sync::{broadcast, Notify};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingSnapshot {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub last_updated_at_ms: Option<u128>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct StatusSnapshot {
    pub redis_connected: bool,
    pub redis_last_error: Option<String>,
    pub last_channel: Option<String>,
    pub last_payload_preview: Option<String>,
    pub last_osc_address: Option<String>,
    pub last_osc_error: Option<String>,
    pub last_osc_at_ms: Option<u128>,
    pub last_farrago_ping_at_ms: Option<u128>,
    pub now_playing: NowPlayingSnapshot,
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
    pub last_farrago_ping_at_ms: RwLock<Option<u128>>,
    pub farrago_board: RwLock<FarragoBoard>,
    pub reconnect: Notify,
    /// Fires whenever the Farrago board state changes. WebSocket clients subscribe to this.
    pub board_changed: broadcast::Sender<()>,
    /// Wakes the play-state monitor when a tile play command is sent.
    pub play_started: Notify,
    // Now Playing state
    pub now_playing_title: RwLock<Option<String>>,
    pub now_playing_artist: RwLock<Option<String>>,
    pub now_playing_album: RwLock<Option<String>>,
    pub now_playing_updated_at_ms: RwLock<Option<u128>>,
}

impl AppState {
    pub fn new(cfg: Config) -> Self {
        let (board_tx, _) = broadcast::channel(64);
        Self {
            config: RwLock::new(cfg),
            redis_connected: AtomicBool::new(false),
            redis_last_error: RwLock::new(None),
            last_channel: RwLock::new(None),
            last_payload_preview: RwLock::new(None),
            last_osc_address: RwLock::new(None),
            last_osc_error: RwLock::new(None),
            last_osc_at_ms: RwLock::new(None),
            last_farrago_ping_at_ms: RwLock::new(None),
            farrago_board: RwLock::new(FarragoBoard::default()),
            reconnect: Notify::new(),
            board_changed: board_tx,
            play_started: Notify::new(),
            now_playing_title: RwLock::new(None),
            now_playing_artist: RwLock::new(None),
            now_playing_album: RwLock::new(None),
            now_playing_updated_at_ms: RwLock::new(None),
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
            last_farrago_ping_at_ms: self
                .last_farrago_ping_at_ms
                .read()
                .ok()
                .and_then(|g| *g),
            now_playing: NowPlayingSnapshot {
                title: self.now_playing_title.read().ok().and_then(|g| g.clone()),
                artist: self.now_playing_artist.read().ok().and_then(|g| g.clone()),
                album: self.now_playing_album.read().ok().and_then(|g| g.clone()),
                last_updated_at_ms: self.now_playing_updated_at_ms.read().ok().and_then(|g| *g),
            },
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

    /// Apply one OSC message to the Farrago board model and notify WS clients.
    pub fn apply_farrago_osc(&self, addr: &str, args: &[OscType]) {
        if let Ok(mut w) = self.farrago_board.write() {
            w.apply_message(addr, args);
        }
        let _ = self.board_changed.send(());
    }

    pub fn farrago_snapshot(&self) -> FarragoBoardSnapshot {
        self.farrago_board
            .read()
            .ok()
            .map(|g| g.snapshot())
            .unwrap_or_default()
    }

    pub fn has_any_playing(&self) -> bool {
        self.farrago_board
            .read()
            .ok()
            .map(|b| b.has_any_playing())
            .unwrap_or(false)
    }

    pub fn record_now_playing(&self, title: Option<String>, artist: Option<String>, album: Option<String>) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        if let Ok(mut w) = self.now_playing_title.write() { *w = title; }
        if let Ok(mut w) = self.now_playing_artist.write() { *w = artist; }
        if let Ok(mut w) = self.now_playing_album.write() { *w = album; }
        if let Ok(mut w) = self.now_playing_updated_at_ms.write() { *w = Some(now); }
    }

    pub fn record_farrago_ping(&self) {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0);
        if let Ok(mut w) = self.last_farrago_ping_at_ms.write() {
            *w = Some(now);
        }
    }
}

pub type SharedState = Arc<AppState>;
