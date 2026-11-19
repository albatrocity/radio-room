use crate::logic::{
    osc_for_segment_ids, segment_cue_from_label, should_fire_segment_osc, OscSkip, SegmentCue,
};
use crate::osc_send::send_osc_datagram;
use crate::state::SharedState;
use futures_util::FutureExt;
use rust_socketio::asynchronous::ClientBuilder;
use rust_socketio::Payload;
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::Mutex;
use tokio::time::sleep;
use tracing::{error, info, warn};

struct SeenSegment {
    id: String,
    at: u64,
}

/// Listen for segment activation on `/device` and fire Farrago OSC when the id changes.
pub async fn run_segment_socket(state: SharedState) {
    let mut backoff_secs: u64 = 1;
    let seen = Arc::new(Mutex::new(None::<SeenSegment>));

    loop {
        let cfg = match state.config.read() {
            Ok(g) => Some(g.clone()),
            Err(_) => None,
        };
        let Some(cfg) = cfg else {
            sleep(Duration::from_secs(1)).await;
            continue;
        };

        if cfg.room_id.trim().is_empty() {
            state.set_segment_socket_connected(false);
            state.set_segment_socket_error(Some(
                "room id is required to watch the active segment".to_string(),
            ));
            sleep(Duration::from_secs(backoff_secs.min(30))).await;
            continue;
        }
        if cfg.device_ingress_secret.is_empty() {
            state.set_segment_socket_connected(false);
            state.set_segment_socket_error(Some(
                "deviceIngressSecret is empty; set the same bearer as DEVICE_INGRESS_SECRET"
                    .to_string(),
            ));
            sleep(Duration::from_secs(backoff_secs.min(30))).await;
            continue;
        }

        match watch_once(&state, &cfg, seen.clone()).await {
            Ok(()) => {
                backoff_secs = 1;
            }
            Err(e) => {
                state.set_segment_socket_connected(false);
                state.set_segment_socket_error(Some(e.clone()));
                warn!(error = %e, "segment socket failed; retrying");
                sleep(Duration::from_secs(backoff_secs.min(30))).await;
                backoff_secs = (backoff_secs * 2).min(30);
            }
        }
    }
}

async fn watch_once(
    state: &SharedState,
    cfg: &crate::config::Config,
    seen: Arc<Mutex<Option<SeenSegment>>>,
) -> Result<(), String> {
    let base = cfg.platform_api_base_url.trim_end_matches('/').to_string();
    let room_id = cfg.room_id.clone();
    let secret = cfg.device_ingress_secret.clone();
    let state_for_events = state.clone();
    let seen_for_events = seen.clone();

    let room_for_open = room_id.clone();
    let state_for_open = state.clone();
    let state_for_close = state.clone();
    let expect_snapshot = Arc::new(AtomicBool::new(false));
    let expect_snapshot_for_open = expect_snapshot.clone();
    let expect_snapshot_for_events = expect_snapshot.clone();
    let client = ClientBuilder::new(base)
        .namespace("/device")
        .reconnect_on_disconnect(true)
        .auth(json!({
            "daemonId": "local-remote",
            "secret": secret,
        }))
        .on("open", move |_payload, socket| {
            let room_id = room_for_open.clone();
            let state = state_for_open.clone();
            let expect_snapshot = expect_snapshot_for_open.clone();
            async move {
                expect_snapshot.store(true, Ordering::SeqCst);
                match socket.emit("watch", json!({ "roomId": room_id })).await {
                    Ok(()) => {
                        state.set_segment_socket_connected(true);
                        state.set_segment_socket_error(None);
                        info!(room_id = %room_id, "segment socket watching");
                    }
                    Err(e) => {
                        state.set_segment_socket_connected(false);
                        state.set_segment_socket_error(Some(format!("watch failed: {e}")));
                        warn!(error = %e, "segment watch emit failed");
                    }
                }
            }
            .boxed()
        })
        .on("close", move |_payload, _socket| {
            let state = state_for_close.clone();
            async move {
                state.set_segment_socket_connected(false);
                state.set_segment_socket_error(Some("segment socket closed".to_string()));
            }
            .boxed()
        })
        .on("segment", move |payload, _client| {
            let state = state_for_events.clone();
            let seen = seen_for_events.clone();
            let expect_snapshot = expect_snapshot_for_events.clone();
            async move {
                let Some(text) = payload_text(&payload) else {
                    state.set_segment_note("segment event had no JSON payload");
                    return;
                };
                apply_segment(&state, &seen, &expect_snapshot, &text).await;
            }
            .boxed()
        })
        .connect()
        .await
        .map_err(|e| format!("segment socket: {e}"))?;

    state.reconnect.notified().await;
    {
        let mut guard = seen.lock().await;
        *guard = None;
    }
    client
        .disconnect()
        .await
        .map_err(|e| format!("segment socket disconnect: {e}"))?;
    info!("segment socket: config changed");
    Ok(())
}

async fn apply_segment(
    state: &SharedState,
    seen: &Mutex<Option<SeenSegment>>,
    expect_snapshot: &AtomicBool,
    text: &str,
) {
    let Some(value) = parse_segment_value(text) else {
        state.set_segment_note("segment event was not a JSON object");
        return;
    };
    let at = value.get("at").and_then(|v| v.as_u64()).unwrap_or(0);
    let room_id = json_string(&value, "roomId");
    let segment_id = json_string(&value, "segmentId");
    let first_after_watch = expect_snapshot.swap(false, Ordering::SeqCst);
    let cue = segment_cue_from_label(
        value.get("cue").and_then(|v| v.as_str()),
        first_after_watch,
    );

    let previous_id = {
        let guard = seen.lock().await;
        if let Some(previous) = guard.as_ref() {
            if at > 0 && previous.at > 0 && at < previous.at {
                drop(guard);
                if first_after_watch {
                    expect_snapshot.store(true, Ordering::SeqCst);
                }
                state.set_segment_note("ignored an older segment cue");
                return;
            }
        }
        guard.as_ref().map(|previous| previous.id.clone())
    };

    state.record_incoming("segment", text);
    info!(
        segment_id = %segment_id,
        room_id = %room_id,
        cue = ?cue,
        "segment cue"
    );

    let fire = should_fire_segment_osc(previous_id.as_deref(), &segment_id, cue);
    {
        let mut guard = seen.lock().await;
        *guard = Some(SeenSegment {
            id: segment_id.clone(),
            at,
        });
    }

    if !fire {
        let note = match cue {
            SegmentCue::Snapshot => format!("joined on segment {segment_id}; not replaying"),
            SegmentCue::Activation => "segment cue had no id".to_string(),
        };
        state.set_segment_note(note);
        return;
    }

    let cfg = match state.config.read() {
        Ok(g) => g.clone(),
        Err(_) => return,
    };
    let (addr, args) = match osc_for_segment_ids(&cfg, &room_id, &segment_id) {
        Ok(action) => action,
        Err(reason) => {
            let note = match reason {
                OscSkip::Empty => "segment cue had no id".to_string(),
                OscSkip::RoomMismatch => format!(
                    "segment {segment_id} is for room {room_id}; this Mac is watching {}",
                    cfg.room_id
                ),
                OscSkip::OscDisabled => {
                    "OSC is disabled in the saved config. Save & apply with OSC enabled.".to_string()
                }
                OscSkip::Unmapped => format!(
                    "segment {segment_id} has no saved Farrago mapping. Save & apply the row, then activate again."
                ),
            };
            warn!(%note, "segment cue did not send OSC");
            state.set_segment_note(note);
            return;
        }
    };
    let host = cfg.features.osc.host.clone();
    let port = cfg.features.osc.port;
    match send_osc_datagram(&host, port, &addr, &args).await {
        Ok(bytes) => {
            info!(address = %addr, ?args, bytes, "segment activation sent OSC");
            state.record_osc_ok(&addr);
            state.set_segment_note(format!("played {addr} for segment {segment_id}"));
        }
        Err(e) => {
            state.record_osc_error(format!("osc send: {e:#}"));
            state.set_segment_note(format!("OSC send failed: {e:#}"));
            error!(error = %e, "OSC send failed");
        }
    }
}

fn parse_segment_value(text: &str) -> Option<Value> {
    let value: Value = serde_json::from_str(text).ok()?;
    match value {
        Value::String(inner) => serde_json::from_str(&inner).ok(),
        other => Some(other),
    }
}

fn json_string(value: &Value, key: &str) -> String {
    match value.get(key) {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => String::new(),
    }
}

fn payload_text(payload: &Payload) -> Option<String> {
    match payload {
        Payload::Text(values) => values.first().map(|value| value.to_string()),
        _ => None,
    }
}
