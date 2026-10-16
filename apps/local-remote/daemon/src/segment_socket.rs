use crate::logic::osc_action_for_segment;
use crate::osc_send::send_osc_datagram;
use crate::state::SharedState;
use futures_util::FutureExt;
use rust_socketio::asynchronous::ClientBuilder;
use rust_socketio::Payload;
use serde_json::{json, Value};
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
            async move {
                if socket
                    .emit("watch", json!({ "roomId": room_id }))
                    .await
                    .is_ok()
                {
                    state.set_segment_socket_connected(true);
                    state.set_segment_socket_error(None);
                    info!(room_id = %room_id, "segment socket watching");
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
            async move {
                let Some(text) = payload_text(&payload) else {
                    return;
                };
                apply_segment(&state, &seen, &text).await;
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

async fn apply_segment(state: &SharedState, seen: &Mutex<Option<SeenSegment>>, text: &str) {
    let Ok(value) = serde_json::from_str::<Value>(text) else {
        return;
    };
    let at = value.get("at").and_then(|v| v.as_u64()).unwrap_or(0);
    let segment_id = value
        .get("segmentId")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    {
        let guard = seen.lock().await;
        if let Some(previous) = guard.as_ref() {
            if at > 0 && at < previous.at {
                return;
            }
            if segment_id == previous.id {
                return;
            }
        }
    }

    state.record_incoming("segment", text);
    {
        let mut guard = seen.lock().await;
        *guard = Some(SeenSegment {
            id: segment_id.clone(),
            at,
        });
    }

    if segment_id.is_empty() {
        return;
    }

    let cfg = match state.config.read() {
        Ok(g) => g.clone(),
        Err(_) => return,
    };
    let Some((addr, args)) = osc_action_for_segment(&cfg, text) else {
        return;
    };
    let host = cfg.features.osc.host.clone();
    let port = cfg.features.osc.port;
    match send_osc_datagram(&host, port, &addr, &args).await {
        Ok(_) => state.record_osc_ok(&addr),
        Err(e) => {
            state.record_osc_error(format!("osc send: {e:#}"));
            error!(error = %e, "OSC send failed");
        }
    }
}

fn payload_text(payload: &Payload) -> Option<String> {
    match payload {
        Payload::Text(values) => values.first().map(|value| value.to_string()),
        _ => None,
    }
}
