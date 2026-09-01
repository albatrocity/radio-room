//! Tokio supervisor: start/stop/restart the ducking audio engine from config.

use crate::config::{Config, DuckingFeature, DuckingStreamKey};
use crate::ducking::dsp::DuckingParams;
use crate::ducking::engine::{start_engine, EngineHandle};
use crate::state::SharedState;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuckingStatusSnapshot {
    pub enabled: bool,
    pub running: bool,
    pub bypass: bool,
    pub device_name: String,
    pub last_error: Option<String>,
    pub sidechain_db: f32,
    pub programme_db: f32,
    pub gain_reduction_db: f32,
}

pub struct DuckingSupervisor {
    engine: Mutex<Option<EngineHandle>>,
    last_error: Mutex<Option<String>>,
    last_stream_key: Mutex<Option<DuckingStreamKey>>,
    pub running: AtomicBool,
    stop_requested: AtomicBool,
}

impl DuckingSupervisor {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            engine: Mutex::new(None),
            last_error: Mutex::new(None),
            last_stream_key: Mutex::new(None),
            running: AtomicBool::new(false),
            stop_requested: AtomicBool::new(false),
        })
    }

    pub async fn snapshot(&self, cfg: &Config) -> DuckingStatusSnapshot {
        let dk = &cfg.features.ducking;
        let (sidechain_db, programme_db, gain_reduction_db, thread_alive) = {
            let guard = self.engine.lock().await;
            if let Some(eng) = guard.as_ref() {
                let (a, b, c) = eng.meters.snapshot();
                (a, b, c, eng.is_alive())
            } else {
                (-120.0, -120.0, 0.0, false)
            }
        };
        let running = self.running.load(Ordering::SeqCst) && thread_alive;
        if self.running.load(Ordering::SeqCst) && !thread_alive {
            self.running.store(false, Ordering::SeqCst);
        }
        DuckingStatusSnapshot {
            enabled: dk.enabled,
            running,
            bypass: dk.bypass,
            device_name: dk.device_name.clone(),
            last_error: self.last_error.lock().await.clone(),
            sidechain_db,
            programme_db,
            gain_reduction_db,
        }
    }

    pub async fn stop(&self) {
        self.stop_requested.store(true, Ordering::SeqCst);
        let mut guard = self.engine.lock().await;
        if let Some(eng) = guard.take() {
            // stop() joins the audio thread — run off the async worker.
            tokio::task::spawn_blocking(move || eng.stop())
                .await
                .ok();
            info!("ducking engine stopped");
        }
        self.running.store(false, Ordering::SeqCst);
        *self.last_stream_key.lock().await = None;
    }

    async fn set_error(&self, msg: Option<String>) {
        *self.last_error.lock().await = msg;
    }

    pub async fn apply_config(&self, feature: &DuckingFeature) {
        if let Some(eng) = self.engine.lock().await.as_ref() {
            eng.params
                .store(Arc::new(DuckingParams::from_feature(feature)));
        }
    }

    async fn engine_is_live(&self) -> bool {
        if !self.running.load(Ordering::SeqCst) {
            return false;
        }
        let guard = self.engine.lock().await;
        guard.as_ref().map(|e| e.is_alive()).unwrap_or(false)
    }

    async fn start_from_feature(&self, feature: &DuckingFeature) {
        let had_engine = self.engine.lock().await.is_some();
        self.stop().await;
        if had_engine {
            // Give Core Audio / Loopback a beat to drop the previous output client
            // before we open another (stacked clients = delayed duplicate music).
            tokio::time::sleep(Duration::from_millis(150)).await;
        }
        self.stop_requested.store(false, Ordering::SeqCst);
        let feature_clone = feature.clone();
        let result = tokio::task::spawn_blocking(move || start_engine(&feature_clone)).await;
        match result {
            Ok(Ok(handle)) => {
                self.set_error(None).await;
                self.running.store(true, Ordering::SeqCst);
                *self.last_stream_key.lock().await = Some(feature.stream_key());
                *self.engine.lock().await = Some(handle);
                info!("ducking engine started");
            }
            Ok(Err(e)) => {
                warn!("ducking engine failed to start: {e}");
                self.set_error(Some(e)).await;
                self.running.store(false, Ordering::SeqCst);
            }
            Err(e) => {
                let msg = format!("ducking spawn_blocking join: {e}");
                warn!("{msg}");
                self.set_error(Some(msg)).await;
                self.running.store(false, Ordering::SeqCst);
            }
        }
    }

    /// Hot-swap DSP (bypass, threshold, …) when the Loopback stream can stay open.
    /// Only tear down Core Audio when enable/device/channels change.
    pub async fn apply_or_restart(&self, feature: &DuckingFeature) {
        if !feature.enabled {
            self.stop().await;
            self.set_error(None).await;
            return;
        }
        if self.engine_is_live().await {
            let same = self.last_stream_key.lock().await.as_ref() == Some(&feature.stream_key());
            if same {
                self.apply_config(feature).await;
                info!(bypass = feature.bypass, "ducking params hot-applied");
                return;
            }
        }
        self.start_from_feature(feature).await;
    }
}

/// Background loop: react to config apply + retry when enabled but not running.
pub async fn run_ducking_supervisor(state: SharedState) {
    let mut backoff = Duration::from_secs(2);
    loop {
        tokio::select! {
            _ = state.ducking_apply.notified() => {
                let cfg = match state.config.read() {
                    Ok(c) => c.clone(),
                    Err(_) => continue,
                };
                state.ducking_supervisor.apply_or_restart(&cfg.features.ducking).await;
                backoff = Duration::from_secs(2);
            }
            _ = tokio::time::sleep(backoff) => {
                let cfg = match state.config.read() {
                    Ok(c) => c.clone(),
                    Err(_) => continue,
                };
                let dk = &cfg.features.ducking;
                if !dk.enabled {
                    continue;
                }
                if state.ducking_supervisor.engine_is_live().await {
                    state.ducking_supervisor.apply_config(dk).await;
                    continue;
                }
                // Retry start after failure / missing device.
                state.ducking_supervisor.start_from_feature(dk).await;
                if state.ducking_supervisor.running.load(Ordering::SeqCst) {
                    backoff = Duration::from_secs(2);
                } else {
                    backoff = (backoff * 2).min(Duration::from_secs(30));
                }
            }
        }
    }
}
