//! macOS Now Playing watcher.
//!
//! Watches the system media center for track changes, publishes
//! `SYSTEM:NOW_PLAYING_CHANGED` to Redis, and writes a `Now Playing.txt`
//! file that Audio Hijack can read for stream overlay metadata.

use crate::state::SharedState;
use std::fs;
use std::process::Command;
use std::time::Duration;
use tokio::sync::mpsc;
use tracing::{debug, error, info, warn};

const CHANNEL: &str = "SYSTEM:NOW_PLAYING_CHANGED";
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
            publish_to_redis(&state, &cfg.room_id, track).await;
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

async fn publish_to_redis(state: &SharedState, room_id: &str, track: &TrackInfo) {
    if room_id.is_empty() {
        warn!("now_playing: no room_id configured, skipping Redis publish");
        return;
    }

    let redis_url = match state.config.read() {
        Ok(g) => g.redis_url.clone(),
        Err(_) => return,
    };

    let client = match redis::Client::open(redis_url.as_str()) {
        Ok(c) => c,
        Err(e) => {
            error!(error = %e, "now_playing: redis client open failed");
            return;
        }
    };

    let mut con = match client.get_multiplexed_async_connection().await {
        Ok(c) => c,
        Err(e) => {
            error!(error = %e, "now_playing: redis connection failed");
            return;
        }
    };

    let payload = serde_json::json!({
        "roomId": room_id,
        "title": track.title,
        "artist": track.artist,
        "album": track.album,
    });

    let result: Result<(), redis::RedisError> = redis::cmd("PUBLISH")
        .arg(CHANNEL)
        .arg(payload.to_string())
        .query_async(&mut con)
        .await;

    match result {
        Ok(_) => debug!("now_playing: published to {CHANNEL}"),
        Err(e) => error!(error = %e, "now_playing: PUBLISH failed"),
    }
}
