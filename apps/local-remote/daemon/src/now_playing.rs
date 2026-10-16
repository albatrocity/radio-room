//! macOS Now Playing watcher.
//!
//! Watches the system media center for track changes, posts now-playing to the
//! platform API, and writes a `Now Playing.txt` file that Audio Hijack can read.

use crate::state::SharedState;
use std::fs;
use std::process::Command;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

const POLL_INTERVAL: Duration = Duration::from_secs(2);

#[derive(Debug, Clone, PartialEq)]
struct TrackInfo {
    title: String,
    artist: String,
    album: String,
}

/// Query a music app via AppleScript. Returns None if the app isn't
/// running or has no track playing.
fn query_app(app: &str) -> Option<TrackInfo> {
    let script = if app == "Spotify" {
        format!(
            r#"tell application "System Events" to if not (exists process "{}") then return ""
tell application "{}" to get name of current track & "\n" & artist of current track & "\n" & album of current track"#,
            app, app
        )
    } else {
        // Apple Music / Music.app
        format!(
            r#"tell application "System Events" to if not (exists process "{}") then return ""
tell application "{}" to get name of current track & "\n" & artist of current track & "\n" & album of current track"#,
            app, app
        )
    };

    let output = Command::new("osascript")
        .args(["-e", &script])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let text = text.trim();
    if text.is_empty() {
        return None;
    }

    let mut lines = text.splitn(3, '\n');
    let title = lines.next().unwrap_or("").to_string();
    let artist = lines.next().unwrap_or("").to_string();
    let album = lines.next().unwrap_or("").to_string();

    if title.is_empty() {
        return None;
    }

    Some(TrackInfo { title, artist, album })
}

/// Try each supported music app in order until one returns track info.
fn read_now_playing() -> Option<TrackInfo> {
    for app in &["Spotify", "Music"] {
        if let Some(track) = query_app(app) {
            return Some(track);
        }
    }
    None
}

/// Polls the macOS Now Playing system API every 2 seconds on a dedicated
/// OS thread and bridges track changes into the async runtime via a channel.
pub async fn run_now_playing_watcher(state: SharedState) {
    let enabled = state
        .config
        .read()
        .ok()
        .map(|c| c.features.now_playing.enabled)
        .unwrap_or(false);

    if !enabled {
        debug!("now_playing: disabled, exiting watcher");
        return;
    }

    info!("now_playing: watcher starting");

    let (tx, mut rx) = mpsc::unbounded_channel::<Option<TrackInfo>>();

    std::thread::spawn(move || {
        let mut last_sent: Option<TrackInfo> = None;

        loop {
            let track = read_now_playing();

            if track != last_sent {
                last_sent = track.clone();
                let _ = tx.send(track);
            }

            std::thread::sleep(POLL_INTERVAL);
        }
    });

    let mut last_track: Option<TrackInfo> = None;

    while let Some(current) = rx.recv().await {
        if current == last_track {
            continue;
        }

        let cfg = match state.config.read() {
            Ok(g) => g.clone(),
            Err(_) => continue,
        };

        if !cfg.features.now_playing.enabled {
            last_track = current;
            continue;
        }

        if let Some(ref track) = current {
            info!(
                title = %track.title,
                artist = %track.artist,
                album = %track.album,
                "now_playing: track changed"
            );

            state.record_now_playing(
                Some(track.title.clone()),
                Some(track.artist.clone()),
                Some(track.album.clone()),
            );

            write_now_playing_file(&cfg.features.now_playing.now_playing_file_path, track);
            publish_now_playing(&cfg, track).await;
        } else {
            debug!("now_playing: no track playing");
            state.record_now_playing(None, None, None);
        }

        last_track = current;
    }
}

fn write_now_playing_file(path: &str, track: &TrackInfo) {
    let expanded = shellexpand::tilde(path);
    let content = format!(
        "Title: {}\nArtist: {}\nAlbum: {}\n",
        track.title, track.artist, track.album
    );

    if let Err(e) = fs::write(expanded.as_ref(), &content) {
        warn!(path = %expanded, error = %e, "now_playing: failed to write file");
    }
}

async fn publish_now_playing(cfg: &crate::config::Config, track: &TrackInfo) {
    if cfg.room_id.is_empty() {
        warn!("now_playing: no room_id configured, skipping platform publish");
        return;
    }
    if cfg.device_ingress_secret.is_empty() {
        warn!("now_playing: deviceIngressSecret is empty, skipping platform publish");
        return;
    }

    let base = cfg.platform_api_base_url.trim_end_matches('/');
    let url = format!("{base}/api/device/now-playing");
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            error!(error = %e, "now_playing: http client failed");
            return;
        }
    };

    let payload = serde_json::json!({
        "roomId": cfg.room_id,
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
    });

    match client
        .post(&url)
        .bearer_auth(&cfg.device_ingress_secret)
        .json(&payload)
        .send()
        .await
    {
        Ok(res) if res.status().is_success() => debug!("now_playing: posted to {url}"),
        Ok(res) => error!(status = %res.status(), "now_playing: platform publish failed"),
        Err(e) => error!(error = %e, "now_playing: platform publish failed"),
    }
}
