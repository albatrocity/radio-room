//! Spawn / health-check / restart the packed bridge-daemon Node child.

use crate::config::{BridgeFeature, Config};
use crate::state::SharedState;
use anyhow::{Context, Result};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tracing::{info, warn};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeSupervisorSnapshot {
    pub enabled: bool,
    pub running: bool,
    pub last_error: Option<String>,
    pub child_api_base: String,
    pub pid: Option<u32>,
}

pub struct BridgeSupervisor {
    child: Mutex<Option<Child>>,
    last_error: Mutex<Option<String>>,
    pub running: AtomicBool,
    stop_requested: AtomicBool,
}

impl BridgeSupervisor {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            child: Mutex::new(None),
            last_error: Mutex::new(None),
            running: AtomicBool::new(false),
            stop_requested: AtomicBool::new(false),
        })
    }

    pub async fn snapshot(&self, cfg: &Config) -> BridgeSupervisorSnapshot {
        let br = &cfg.features.bridge;
        let pid = {
            let mut guard = self.child.lock().await;
            guard.as_mut().and_then(|c| c.id())
        };
        BridgeSupervisorSnapshot {
            enabled: br.enabled,
            running: self.running.load(Ordering::SeqCst),
            last_error: self.last_error.lock().await.clone(),
            child_api_base: br.child_api_base.clone(),
            pid,
        }
    }

    pub async fn set_error(&self, msg: Option<String>) {
        *self.last_error.lock().await = msg;
    }

    pub async fn stop(&self) {
        self.stop_requested.store(true, Ordering::SeqCst);
        let mut guard = self.child.lock().await;
        if let Some(mut child) = guard.take() {
            let _ = child.kill().await;
            let _ = child.wait().await;
            info!("bridge-daemon child stopped");
        }
        self.running.store(false, Ordering::SeqCst);
    }

    pub async fn restart(&self, state: &SharedState) -> Result<()> {
        self.stop().await;
        self.stop_requested.store(false, Ordering::SeqCst);
        let cfg = state
            .config
            .read()
            .map_err(|_| anyhow::anyhow!("config lock poisoned"))?
            .clone();
        if !cfg.features.bridge.enabled {
            anyhow::bail!("bridge feature is disabled");
        }
        self.spawn_child(&cfg).await?;
        self.wait_healthy(&cfg.features.bridge).await?;
        if cfg.features.bridge.auto_connect {
            try_auto_connect(&cfg).await;
        }
        Ok(())
    }

    async fn spawn_child(&self, cfg: &Config) -> Result<()> {
        let br = &cfg.features.bridge;
        let exe_dir = executable_dir()?;
        let node = resolve_path(&exe_dir, &br.node_path);
        let daemon = resolve_path(&exe_dir, &br.daemon_path);
        let package_root = daemon
            .parent()
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|| exe_dir.clone());

        if !node.exists() {
            anyhow::bail!("bridge node binary not found at {}", node.display());
        }
        if !daemon.exists() {
            anyhow::bail!("bridge daemon.cjs not found at {}", daemon.display());
        }

        info!(
            node = %node.display(),
            daemon = %daemon.display(),
            "starting bridge-daemon child"
        );

        let mut cmd = Command::new(&node);
        cmd.arg(&daemon)
            .arg("serve")
            .current_dir(&package_root)
            .env("BRIDGE_PACKAGE_ROOT", &package_root)
            .env("BRIDGE_REDIS_URL", &cfg.redis_url)
            .stdout(Stdio::inherit())
            .stderr(Stdio::inherit())
            .kill_on_drop(true);

        if !cfg.room_id.trim().is_empty() {
            cmd.env("BRIDGE_DEFAULT_ROOM_ID", cfg.room_id.trim());
        }

        let child = cmd.spawn().with_context(|| {
            format!(
                "spawn {} {} serve",
                node.display(),
                daemon.display()
            )
        })?;

        {
            let mut guard = self.child.lock().await;
            *guard = Some(child);
        }
        self.running.store(true, Ordering::SeqCst);
        self.set_error(None).await;
        Ok(())
    }

    async fn wait_healthy(&self, br: &BridgeFeature) -> Result<()> {
        let url = format!("{}/api/status", br.child_api_base.trim_end_matches('/'));
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(2))
            .build()?;
        for attempt in 1..=40 {
            if self.stop_requested.load(Ordering::SeqCst) {
                anyhow::bail!("bridge start cancelled");
            }
            // Detect early exit
            {
                let mut guard = self.child.lock().await;
                if let Some(child) = guard.as_mut() {
                    if let Ok(Some(status)) = child.try_wait() {
                        self.running.store(false, Ordering::SeqCst);
                        anyhow::bail!("bridge-daemon exited early: {status}");
                    }
                }
            }
            match client.get(&url).send().await {
                Ok(res) if res.status().is_success() => {
                    info!(attempt, "bridge-daemon healthy");
                    return Ok(());
                }
                Ok(res) => {
                    warn!(attempt, status = %res.status(), "bridge health not ready");
                }
                Err(e) => {
                    if attempt == 1 || attempt % 10 == 0 {
                        warn!(attempt, error = %e, "bridge health poll");
                    }
                }
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
        anyhow::bail!("bridge-daemon did not become healthy at {url}");
    }
}

fn executable_dir() -> Result<PathBuf> {
    let exe = std::env::current_exe().context("current_exe")?;
    Ok(exe
        .parent()
        .map(|p| p.to_path_buf())
        .unwrap_or_else(|| PathBuf::from(".")))
}

fn resolve_path(exe_dir: &Path, configured: &str) -> PathBuf {
    let p = PathBuf::from(configured.trim());
    if p.is_absolute() {
        p
    } else {
        exe_dir.join(p)
    }
}

async fn try_auto_connect(cfg: &Config) {
    let base = cfg.features.bridge.child_api_base.trim_end_matches('/');
    let room = cfg.room_id.trim();
    if room.is_empty() {
        warn!("bridge autoConnect skipped — roomId empty");
        return;
    }
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            warn!(error = %e, "bridge autoConnect client");
            return;
        }
    };
    let url = format!("{base}/api/connect");
    match client
        .post(&url)
        .json(&serde_json::json!({ "roomId": room }))
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => {
            info!(room, "bridge autoConnect ok");
        }
        Ok(res) => {
            let body = res.text().await.unwrap_or_default();
            warn!(room, body = %body, "bridge autoConnect failed");
        }
        Err(e) => warn!(error = %e, "bridge autoConnect request failed"),
    }
}

/// Background loop: keep child alive while bridge.enabled.
pub async fn run_bridge_supervisor(state: SharedState) {
    let supervisor = state.bridge_supervisor.clone();
    loop {
        // Clone under the lock, then drop the guard before any `.await`.
        let Some(cfg) = state.config.read().ok().map(|c| c.clone()) else {
            tokio::time::sleep(Duration::from_secs(1)).await;
            continue;
        };

        if !cfg.features.bridge.enabled {
            if supervisor.running.load(Ordering::SeqCst) {
                supervisor.stop().await;
            }
            // Wait for config change
            state.bridge_apply.notified().await;
            continue;
        }

        if !supervisor.running.load(Ordering::SeqCst) {
            supervisor.stop_requested.store(false, Ordering::SeqCst);
            match supervisor.spawn_child(&cfg).await {
                Ok(()) => match supervisor.wait_healthy(&cfg.features.bridge).await {
                    Ok(()) => {
                        if cfg.features.bridge.auto_connect {
                            try_auto_connect(&cfg).await;
                        }
                    }
                    Err(e) => {
                        warn!(error = %e, "bridge health failed");
                        supervisor.set_error(Some(e.to_string())).await;
                        supervisor.stop().await;
                        tokio::time::sleep(Duration::from_secs(3)).await;
                    }
                },
                Err(e) => {
                    warn!(error = %e, "bridge spawn failed");
                    supervisor.set_error(Some(e.to_string())).await;
                    tokio::time::sleep(Duration::from_secs(3)).await;
                }
            }
        } else {
            // Detect crash
            let mut exited = false;
            {
                let mut guard = supervisor.child.lock().await;
                if let Some(child) = guard.as_mut() {
                    if let Ok(Some(status)) = child.try_wait() {
                        warn!(%status, "bridge-daemon child exited; will restart");
                        *guard = None;
                        exited = true;
                    }
                }
            }
            if exited {
                supervisor.running.store(false, Ordering::SeqCst);
                supervisor
                    .set_error(Some("bridge-daemon exited unexpectedly".into()))
                    .await;
                tokio::time::sleep(Duration::from_secs(2)).await;
                continue;
            }
        }

        tokio::select! {
            _ = state.bridge_apply.notified() => {}
            _ = tokio::time::sleep(Duration::from_secs(2)) => {}
        }
    }
}

/// Proxy an HTTP request to the bridge child. Returns (status, content-type, body).
pub async fn proxy_to_child(
    child_api_base: &str,
    method: reqwest::Method,
    path_and_query: &str,
    body: Option<Vec<u8>>,
) -> Result<(u16, String, Vec<u8>)> {
    let base = child_api_base.trim_end_matches('/');
    let path = if path_and_query.starts_with('/') {
        path_and_query.to_string()
    } else {
        format!("/{path_and_query}")
    };
    let url = format!("{base}{path}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()?;
    let mut req = client.request(method, &url);
    if let Some(b) = body {
        req = req
            .header(reqwest::header::CONTENT_TYPE, "application/json")
            .body(b);
    }
    let res = req.send().await.with_context(|| format!("proxy {url}"))?;
    let status = res.status().as_u16();
    let ctype = res
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("application/json")
        .to_string();
    let bytes = res.bytes().await?.to_vec();
    Ok((status, ctype, bytes))
}
