use crate::config::{save, Config};
use crate::farrago::FarragoBoardSnapshot;
use crate::osc_send::{default_args_to_osc, run_osc_connection_test, send_osc_datagram};
use crate::state::{SharedState, StatusSnapshot};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Json};
use axum::routing::{get, post};
use axum::Router;
use rosc::OscType;
use serde::Deserialize;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;
use tracing::debug;

const INDEX_HTML: &str = include_str!("../../ui/index.html");
const SOUNDBOARD_HTML: &str = include_str!("../../ui/soundboard.html");

pub fn build_router(state: SharedState) -> Router {
    Router::new()
        .route("/", get(|| async { Html(INDEX_HTML) }))
        .route("/soundboard", get(|| async { Html(SOUNDBOARD_HTML) }))
        .route("/api/config", get(get_config).put(put_config))
        .route("/api/status", get(get_status))
        .route("/api/osc-test", post(post_osc_test))
        .route(
            "/api/soundboard/state",
            get(get_soundboard_state),
        )
        .route("/api/soundboard/ping", post(post_soundboard_ping))
        .route("/api/soundboard/play", post(post_soundboard_play))
        .route("/api/soundboard/stop", post(post_soundboard_stop))
        .route("/api/soundboard/ws", get(ws_soundboard))
        .with_state(state)
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .layer(TraceLayer::new_for_http())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct OscTestRequest {
    host: Option<String>,
    port: Option<u16>,
    /// Defaults to `/ping` (Farrago uses this for controller sync).
    address: Option<String>,
    args: Option<Vec<f32>>,
    /// If true, wait up to `replyTimeoutMs` for any UDP reply (default true).
    wait_for_reply: Option<bool>,
    #[serde(default)]
    reply_timeout_ms: Option<u64>,
}

async fn post_osc_test(
    State(state): State<SharedState>,
    Json(req): Json<OscTestRequest>,
) -> impl IntoResponse {
    let cfg = match state.config.read() {
        Ok(c) => c.clone(),
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "ok": false, "error": "config lock poisoned" })),
            )
                .into_response();
        }
    };

    let host = req
        .host
        .as_deref()
        .unwrap_or(cfg.features.osc.host.as_str())
        .trim()
        .to_string();
    if host.is_empty() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": "host is empty" })),
        )
            .into_response();
    }

    let port = match req.port.or(Some(cfg.features.osc.port)) {
        Some(p) if p > 0 => p,
        _ => {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "port must be set (1–65535); set OSC port in the form or save config first"
                })),
            )
                .into_response();
        }
    };

    let address = req
        .address
        .as_deref()
        .unwrap_or("/ping")
        .trim()
        .to_string();
    let args = match &req.args {
        Some(a) => default_args_to_osc(a),
        None => vec![],
    };

    let wait_reply = req.wait_for_reply.unwrap_or(true);
    let reply_timeout_ms = req.reply_timeout_ms.unwrap_or(500).min(5000);

    let wait_ms = if wait_reply { reply_timeout_ms } else { 0 };

    match run_osc_connection_test(&host, port, &address, &args, wait_ms).await {
        Ok(outcome) => {
            let note = if outcome.reply_received {
                "UDP reply received on the same socket. OSC path to this host:port works."
            } else if wait_reply {
                "UDP send succeeded. No reply on this socket is normal for Farrago: it usually sends OSC *output* to the address configured under OSC Output, not back to the sender's ephemeral port—so /ping updates may go nowhere visible unless Output is set. Next: confirm tile paths and add default args (e.g. 1) for /play or /select; same-machine runs can use 127.0.0.1."
            } else {
                "UDP send succeeded (reply wait disabled)."
            };
            Json(serde_json::json!({
                "ok": true,
                "target": format!("{host}:{port}"),
                "address": address,
                "outcome": outcome,
                "note": note,
            }))
            .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": e.to_string(),
                "target": format!("{host}:{port}"),
                "address": address,
            })),
        )
            .into_response(),
    }
}

async fn get_config(State(state): State<SharedState>) -> impl IntoResponse {
    match state.config.read() {
        Ok(cfg) => Json(cfg.clone()).into_response(),
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn put_config(
    State(state): State<SharedState>,
    Json(body): Json<Config>,
) -> impl IntoResponse {
    if let Err(e) = body.validate() {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    if let Err(e) = save(&body) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e.to_string() })),
        )
            .into_response();
    }
    {
        let mut w = match state.config.write() {
            Ok(w) => w,
            Err(_) => {
                return StatusCode::INTERNAL_SERVER_ERROR.into_response();
            }
        };
        *w = body.clone();
    }
    state.reconnect.notify_one();
    Json(body).into_response()
}

async fn get_status(State(state): State<SharedState>) -> Json<StatusSnapshot> {
    Json(state.snapshot())
}

fn soundboard_send_guard(cfg: &Config) -> Result<(), String> {
    if !cfg.features.soundboard.enabled {
        return Err("soundboard feature is disabled; enable features.soundboard in config".into());
    }
    if !cfg.features.osc.enabled {
        return Err("OSC must be enabled (features.osc) for soundboard sends".into());
    }
    if cfg.features.osc.port == 0 {
        return Err("features.osc.port must be set (Farrago OSC Input)".into());
    }
    if cfg.features.osc.host.trim().is_empty() {
        return Err("features.osc.host must be set".into());
    }
    Ok(())
}

async fn get_soundboard_state(State(state): State<SharedState>) -> Json<FarragoBoardSnapshot> {
    Json(state.farrago_snapshot())
}

async fn post_soundboard_ping(State(state): State<SharedState>) -> impl IntoResponse {
    let cfg = match state.config.read() {
        Ok(c) => c.clone(),
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "ok": false, "error": "config lock poisoned" })),
            )
                .into_response();
        }
    };
    if let Err(e) = soundboard_send_guard(&cfg) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": e })),
        )
            .into_response();
    }
    let host = cfg.features.osc.host.clone();
    let port = cfg.features.osc.port;
    let mut total_sent = 0usize;
    let mut last_err: Option<String> = None;
    for i in 0..3u8 {
        if i > 0 {
            tokio::time::sleep(std::time::Duration::from_millis(150)).await;
        }
        match send_osc_datagram(&host, port, "/ping", &[]).await {
            Ok(n) => total_sent += n,
            Err(e) => last_err = Some(e.to_string()),
        }
    }
    if total_sent > 0 {
        state.record_farrago_ping();
        Json(serde_json::json!({
            "ok": true,
            "bytesSent": total_sent,
            "pings": 3,
            "note": "Sent 3 pings (150 ms apart) so Farrago can flush all tile data without packet loss."
        }))
        .into_response()
    } else {
        (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": last_err.unwrap_or_else(|| "unknown".to_string()),
            })),
        )
            .into_response()
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SoundboardTileBody {
    /// When true, send `/set/selected/tile/{x}/{y}/play` (Farrago's current set).
    #[serde(default)]
    use_selected_set: bool,
    /// Required when `use_selected_set` is false.
    #[serde(default)]
    set: Option<usize>,
    x: usize,
    y: usize,
}

async fn post_soundboard_play(State(state): State<SharedState>, Json(body): Json<SoundboardTileBody>) -> impl IntoResponse {
    soundboard_tile_action(state, body, 1.0).await
}

async fn post_soundboard_stop(State(state): State<SharedState>, Json(body): Json<SoundboardTileBody>) -> impl IntoResponse {
    soundboard_tile_action(state, body, 0.0).await
}

async fn soundboard_tile_action(
    state: SharedState,
    body: SoundboardTileBody,
    arg: f32,
) -> impl IntoResponse {
    let cfg = match state.config.read() {
        Ok(c) => c.clone(),
        Err(_) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({ "ok": false, "error": "config lock poisoned" })),
            )
                .into_response();
        }
    };
    if let Err(e) = soundboard_send_guard(&cfg) {
        return (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "ok": false, "error": e })),
        )
            .into_response();
    }
    let addr = if body.use_selected_set {
        format!("/set/selected/tile/{}/{}/play", body.x, body.y)
    } else {
        let Some(set) = body.set else {
            return (
                StatusCode::BAD_REQUEST,
                Json(serde_json::json!({
                    "ok": false,
                    "error": "missing \"set\" (or set useSelectedSet: true)"
                })),
            )
                .into_response();
        };
        format!("/set/{set}/tile/{}/{}/play", body.x, body.y)
    };
    let host = cfg.features.osc.host.as_str();
    let port = cfg.features.osc.port;
    let args = vec![OscType::Float(arg)];
    match send_osc_datagram(host, port, &addr, &args).await {
        Ok(bytes_sent) => {
            if arg > 0.5 {
                state.play_started.notify_one();
            }
            Json(serde_json::json!({
                "ok": true,
                "address": addr,
                "bytesSent": bytes_sent,
            }))
            .into_response()
        }
        Err(e) => (
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({
                "ok": false,
                "error": e.to_string(),
                "address": addr,
            })),
        )
            .into_response(),
    }
}

// ---------------------------------------------------------------------------
// WebSocket: real-time board state push
// ---------------------------------------------------------------------------

async fn ws_soundboard(
    ws: WebSocketUpgrade,
    State(state): State<SharedState>,
) -> impl IntoResponse {
    ws.on_upgrade(|socket| handle_soundboard_ws(socket, state))
}

async fn handle_soundboard_ws(mut socket: WebSocket, state: SharedState) {
    debug!("soundboard WS connected");

    let mut last_json = String::new();

    // Send current snapshot immediately on connect.
    if send_snapshot_dedup(&mut socket, &state, &mut last_json)
        .await
        .is_err()
    {
        return;
    }

    let mut rx = state.board_changed.subscribe();

    loop {
        tokio::select! {
            biased;
            result = rx.recv() => {
                if result.is_err() {
                    break;
                }
                // Drain any queued notifications and debounce rapid bursts
                // (a /ping response can fire hundreds of messages in <50ms).
                tokio::time::sleep(std::time::Duration::from_millis(50)).await;
                while rx.try_recv().is_ok() {}

                if send_snapshot_dedup(&mut socket, &state, &mut last_json)
                    .await
                    .is_err()
                {
                    break;
                }
            }
            msg = socket.recv() => {
                match msg {
                    Some(Ok(Message::Close(_))) | None => break,
                    Some(Ok(Message::Ping(data))) => {
                        let _ = socket.send(Message::Pong(data)).await;
                    }
                    _ => {}
                }
            }
        }
    }

    debug!("soundboard WS disconnected");
}

/// Only send a WS frame when the snapshot JSON differs from the last push.
async fn send_snapshot_dedup(
    socket: &mut WebSocket,
    state: &SharedState,
    last_json: &mut String,
) -> Result<(), ()> {
    let snapshot = state.farrago_snapshot();
    let json = serde_json::to_string(&snapshot).unwrap_or_default();
    if json == *last_json {
        return Ok(());
    }
    *last_json = json.clone();
    socket
        .send(Message::Text(json.into()))
        .await
        .map_err(|_| ())
}
