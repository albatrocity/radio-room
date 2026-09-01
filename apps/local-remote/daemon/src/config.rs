//! Persistent JSON config (platform config dir: `local-remote/config.json`).

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;

/// Default HTTP bind for the local control plane.
pub const DEFAULT_HTTP_ADDR: &str = "127.0.0.1:9876";
/// Default Redis URL for dev (matches common local setups).
pub const DEFAULT_REDIS_URL: &str = "redis://127.0.0.1:6379";
pub const DEFAULT_OSC_HOST: &str = "127.0.0.1";
/// Default platform API for scheduling picks (local monorepo API).
pub const DEFAULT_PLATFORM_API_BASE_URL: &str = "http://127.0.0.1:3000";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// Full Redis connection URL (e.g. `redis://:pass@host:6379` or `rediss://...` for TLS).
    /// For `rediss://` when verification fails (`UnknownIssuer`), append `/#insecure` to skip cert verification.
    #[serde(default = "default_redis_url")]
    pub redis_url: String,
    /// If empty, all rooms match for event handling.
    #[serde(default)]
    pub room_id: String,
    /// Local HTTP API + static UI (`host:port` or `ip:port`).
    #[serde(default = "default_http_addr")]
    pub http_listen: String,
    /// Platform HTTP API base URL for scheduling picks in the UI (e.g. `https://api.example.com`).
    #[serde(default = "default_platform_api_base_url")]
    pub platform_api_base_url: String,
    #[serde(default)]
    pub features: Features,
}

fn default_redis_url() -> String {
    DEFAULT_REDIS_URL.to_string()
}

fn default_http_addr() -> String {
    DEFAULT_HTTP_ADDR.to_string()
}

fn default_platform_api_base_url() -> String {
    DEFAULT_PLATFORM_API_BASE_URL.to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Features {
    #[serde(default)]
    pub osc: OscFeature,
    /// Browser soundboard + UDP listener for Farrago OSC Output (see README).
    #[serde(default)]
    pub soundboard: SoundboardFeature,
    /// macOS Now Playing watcher: publishes track metadata to Redis and writes Now Playing.txt.
    #[serde(default)]
    pub now_playing: NowPlayingFeature,
    /// Supervise packed bridge-daemon (Node child) and proxy `/api/bridge/*`.
    #[serde(default)]
    pub bridge: BridgeFeature,
    /// Sidechain ducking on a Loopback (or other) multi-channel device — Ableton compressor replacement.
    #[serde(default)]
    pub ducking: DuckingFeature,
}

fn default_bridge_child_api_base() -> String {
    "http://127.0.0.1:18766".to_string()
}

/// Relative to the `local-remote` executable directory when not absolute.
fn default_bridge_node_path() -> String {
    "runtime/node".to_string()
}

fn default_bridge_daemon_path() -> String {
    "bridge-daemon/daemon.cjs".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeFeature {
    #[serde(default)]
    pub enabled: bool,
    /// After child is healthy, POST /api/connect using roomId (or child's defaultRoomId).
    #[serde(default)]
    pub auto_connect: bool,
    #[serde(default = "default_bridge_node_path")]
    pub node_path: String,
    #[serde(default = "default_bridge_daemon_path")]
    pub daemon_path: String,
    #[serde(default = "default_bridge_child_api_base")]
    pub child_api_base: String,
}

impl Default for BridgeFeature {
    fn default() -> Self {
        Self {
            enabled: false,
            auto_connect: false,
            node_path: default_bridge_node_path(),
            daemon_path: default_bridge_daemon_path(),
            child_api_base: default_bridge_child_api_base(),
        }
    }
}

fn default_ducking_device_name() -> String {
    "Ducking".to_string()
}

fn default_sidechain_left() -> u16 {
    1
}
fn default_sidechain_right() -> u16 {
    2
}
fn default_programme_left() -> u16 {
    3
}
fn default_programme_right() -> u16 {
    4
}
fn default_output_left() -> u16 {
    5
}
fn default_output_right() -> u16 {
    6
}
fn default_threshold_db() -> f32 {
    -31.5
}
fn default_ratio() -> f32 {
    100.0
}
fn default_attack_ms() -> f32 {
    2.9
}
fn default_release_ms() -> f32 {
    1714.0
}
fn default_knee_db() -> f32 {
    6.0
}
fn default_sidechain_hpf_hz() -> f32 {
    80.0
}

/// Loopback (etc.) sidechain ducker — replaces Ableton Live compressor on the DJ Mac.
/// Channel indices are **1-based** (Ableton / operator numbering).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DuckingFeature {
    #[serde(default)]
    pub enabled: bool,
    /// Core Audio device name (Loopback virtual device).
    #[serde(default = "default_ducking_device_name")]
    pub device_name: String,
    /// Optional Core Audio UID; when set, preferred over name match.
    #[serde(default)]
    pub device_uid: Option<String>,
    #[serde(default = "default_sidechain_left")]
    pub sidechain_left: u16,
    #[serde(default = "default_sidechain_right")]
    pub sidechain_right: u16,
    #[serde(default = "default_programme_left")]
    pub programme_left: u16,
    #[serde(default = "default_programme_right")]
    pub programme_right: u16,
    #[serde(default = "default_output_left")]
    pub output_left: u16,
    #[serde(default = "default_output_right")]
    pub output_right: u16,
    #[serde(default = "default_threshold_db")]
    pub threshold_db: f32,
    /// Compression ratio (≥ 1). Use a high value (e.g. 100) for Ableton-style ∞ ducking.
    #[serde(default = "default_ratio")]
    pub ratio: f32,
    #[serde(default = "default_attack_ms")]
    pub attack_ms: f32,
    #[serde(default = "default_release_ms")]
    pub release_ms: f32,
    #[serde(default = "default_knee_db")]
    pub knee_db: f32,
    /// Makeup gain in dB applied after gain reduction.
    #[serde(default)]
    pub makeup_db: f32,
    /// Sidechain high-pass filter frequency in Hz; 0 disables.
    #[serde(default = "default_sidechain_hpf_hz")]
    pub sidechain_hpf_hz: f32,
    /// When true, pass programme through at unity (engine may still run).
    #[serde(default)]
    pub bypass: bool,
}

impl Default for DuckingFeature {
    fn default() -> Self {
        Self {
            enabled: false,
            device_name: default_ducking_device_name(),
            device_uid: None,
            sidechain_left: default_sidechain_left(),
            sidechain_right: default_sidechain_right(),
            programme_left: default_programme_left(),
            programme_right: default_programme_right(),
            output_left: default_output_left(),
            output_right: default_output_right(),
            threshold_db: default_threshold_db(),
            ratio: default_ratio(),
            attack_ms: default_attack_ms(),
            release_ms: default_release_ms(),
            knee_db: default_knee_db(),
            makeup_db: 0.0,
            sidechain_hpf_hz: default_sidechain_hpf_hz(),
            // Default bypass false so enabling the feature actually ducks.
            bypass: false,
        }
    }
}

/// Device + channel map. Changing these requires tearing down Core Audio streams.
/// Bypass / compressor numbers are not part of this key (hot-applied on the running engine).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DuckingStreamKey {
    pub device_name: String,
    pub device_uid: Option<String>,
    pub sidechain_left: u16,
    pub sidechain_right: u16,
    pub programme_left: u16,
    pub programme_right: u16,
    pub output_left: u16,
    pub output_right: u16,
}

impl DuckingFeature {
    pub fn stream_key(&self) -> DuckingStreamKey {
        DuckingStreamKey {
            device_name: self.device_name.clone(),
            device_uid: self.device_uid.clone(),
            sidechain_left: self.sidechain_left,
            sidechain_right: self.sidechain_right,
            programme_left: self.programme_left,
            programme_right: self.programme_right,
            output_left: self.output_left,
            output_right: self.output_right,
        }
    }
}

fn default_now_playing_file_path() -> String {
    dirs::home_dir()
        .map(|h| h.join("Now Playing.txt").to_string_lossy().into_owned())
        .unwrap_or_else(|| "Now Playing.txt".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NowPlayingFeature {
    #[serde(default)]
    pub enabled: bool,
    /// Path to write the Now Playing.txt file for Audio Hijack.
    #[serde(default = "default_now_playing_file_path")]
    pub now_playing_file_path: String,
}

impl Default for NowPlayingFeature {
    fn default() -> Self {
        Self {
            enabled: false,
            now_playing_file_path: default_now_playing_file_path(),
        }
    }
}

/// When enabled, binds UDP on `osc_listen_port` and expects Farrago **OSC Output** aimed at this host:port.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SoundboardFeature {
    #[serde(default)]
    pub enabled: bool,
    /// Local UDP port to receive OSC from Farrago (distinct from `osc.port`, which is Farrago **Input**).
    #[serde(default)]
    pub osc_listen_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OscFeature {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_osc_host")]
    pub host: String,
    /// UDP port (must match listener, e.g. Farrago OSC Input).
    #[serde(default)]
    pub port: u16,
    /// Map segment id → full OSC path (e.g. `/set/selected/tile/0/0/play`).
    #[serde(default)]
    pub segment_map: HashMap<String, String>,
    /// Appended as OSC float arguments on every send (e.g. `[1.0]` for Farrago toggles).
    #[serde(default)]
    pub default_args: Vec<f32>,
}

fn default_osc_host() -> String {
    DEFAULT_OSC_HOST.to_string()
}

impl Default for OscFeature {
    fn default() -> Self {
        Self {
            enabled: false,
            host: default_osc_host(),
            port: 0,
            segment_map: HashMap::new(),
            default_args: Vec::new(),
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            redis_url: default_redis_url(),
            room_id: String::new(),
            http_listen: default_http_addr(),
            platform_api_base_url: default_platform_api_base_url(),
            features: Features::default(),
        }
    }
}

fn validate_osc_address(path: &str) -> Result<()> {
    let t = path.trim();
    if t.is_empty() {
        anyhow::bail!("OSC address must be non-empty");
    }
    if !t.starts_with('/') {
        anyhow::bail!("OSC address must start with '/': {path:?}");
    }
    Ok(())
}

impl Config {
    pub fn validate(&self) -> Result<()> {
        redis::Client::open(self.redis_url.as_str()).context("invalid redis_url")?;
        let o = &self.features.osc;
        if o.enabled {
            if o.port == 0 {
                anyhow::bail!("features.osc.port must be non-zero when OSC is enabled");
            }
            if o.host.trim().is_empty() {
                anyhow::bail!("features.osc.host must be set when OSC is enabled");
            }
            for (seg, path) in &o.segment_map {
                validate_osc_address(path)
                    .with_context(|| format!("invalid OSC path for segment {seg}"))?;
            }
        }
        let sb = &self.features.soundboard;
        if sb.enabled {
            if !o.enabled {
                anyhow::bail!("features.soundboard requires features.osc.enabled (uses osc.host / osc.port to send)");
            }
            if sb.osc_listen_port == 0 {
                anyhow::bail!("features.soundboard.oscListenPort must be non-zero when soundboard is enabled");
            }
        }
        let br = &self.features.bridge;
        if br.enabled {
            if br.child_api_base.trim().is_empty() {
                anyhow::bail!("features.bridge.childApiBase must be set when bridge is enabled");
            }
            if br.node_path.trim().is_empty() || br.daemon_path.trim().is_empty() {
                anyhow::bail!("features.bridge.nodePath and daemonPath must be set when bridge is enabled");
            }
        }
        let dk = &self.features.ducking;
        if dk.enabled {
            if dk.device_name.trim().is_empty() {
                anyhow::bail!("features.ducking.deviceName must be set when ducking is enabled");
            }
            for (label, ch) in [
                ("sidechainLeft", dk.sidechain_left),
                ("sidechainRight", dk.sidechain_right),
                ("programmeLeft", dk.programme_left),
                ("programmeRight", dk.programme_right),
                ("outputLeft", dk.output_left),
                ("outputRight", dk.output_right),
            ] {
                if ch == 0 {
                    anyhow::bail!("features.ducking.{label} must be >= 1 (1-based channel index)");
                }
            }
            if dk.ratio < 1.0 {
                anyhow::bail!("features.ducking.ratio must be >= 1");
            }
            if dk.attack_ms <= 0.0 || dk.release_ms <= 0.0 {
                anyhow::bail!("features.ducking.attackMs and releaseMs must be > 0");
            }
            if dk.knee_db < 0.0 {
                anyhow::bail!("features.ducking.kneeDb must be >= 0");
            }
            if dk.sidechain_hpf_hz < 0.0 {
                anyhow::bail!("features.ducking.sidechainHpfHz must be >= 0");
            }
        }
        Ok(())
    }

    /// When bridge owns Now Playing.txt, disable the local-remote macOS watcher.
    pub fn with_bridge_now_playing_guard(mut self) -> Self {
        if self.features.bridge.enabled {
            self.features.now_playing.enabled = false;
        }
        self
    }
}

pub fn config_path() -> Result<PathBuf> {
    let dir = dirs::config_dir()
        .context("could not resolve config directory (dirs::config_dir)")?
        .join("local-remote");
    Ok(dir.join("config.json"))
}

pub fn load_or_create_default() -> Result<Config> {
    let path = config_path()?;
    if path.exists() {
        let raw = fs::read_to_string(&path).with_context(|| format!("read {}", path.display()))?;
        let c: Config = serde_json::from_str(&raw).context("parse config.json")?;
        c.validate()?;
        return Ok(c);
    }
    let c = Config::default();
    save(&c)?;
    Ok(c)
}

pub fn save(cfg: &Config) -> Result<()> {
    cfg.validate()?;
    let path = config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).with_context(|| format!("mkdir {}", parent.display()))?;
    }
    let tmp = path.with_extension("json.tmp");
    let raw = serde_json::to_string_pretty(cfg).context("serialize config")?;
    fs::write(&tmp, raw).with_context(|| format!("write {}", tmp.display()))?;
    fs::rename(&tmp, &path).with_context(|| format!("rename {} -> {}", tmp.display(), path.display()))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ducking_stream_key_ignores_bypass_and_compressor() {
        let a = DuckingFeature::default();
        let mut b = a.clone();
        b.bypass = true;
        b.threshold_db = -12.0;
        b.ratio = 4.0;
        assert_eq!(a.stream_key(), b.stream_key());
    }

    #[test]
    fn ducking_stream_key_includes_device_and_channels() {
        let a = DuckingFeature::default();
        let mut b = a.clone();
        b.output_left = 7;
        assert_ne!(a.stream_key(), b.stream_key());
        let mut c = a.clone();
        c.device_name = "Other".into();
        assert_ne!(a.stream_key(), c.stream_key());
    }

    #[test]
    fn ducking_partial_eq_treats_identical_config_as_equal() {
        let a = DuckingFeature::default();
        let b = a.clone();
        assert_eq!(a, b);
    }
}
