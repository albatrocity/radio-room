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

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Config {
    /// Full Redis connection URL (e.g. `redis://:pass@host:6379`).
    #[serde(default = "default_redis_url")]
    pub redis_url: String,
    /// If empty, all rooms match for event handling.
    #[serde(default)]
    pub room_id: String,
    /// Local HTTP API + static UI (`host:port` or `ip:port`).
    #[serde(default = "default_http_addr")]
    pub http_listen: String,
    #[serde(default)]
    pub features: Features,
}

fn default_redis_url() -> String {
    DEFAULT_REDIS_URL.to_string()
}

fn default_http_addr() -> String {
    DEFAULT_HTTP_ADDR.to_string()
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Features {
    #[serde(default)]
    pub osc: OscFeature,
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
        Ok(())
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
