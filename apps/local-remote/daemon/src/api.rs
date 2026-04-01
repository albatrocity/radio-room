use crate::config::{save, Config};
use crate::osc_send::{default_args_to_osc, run_osc_connection_test};
use crate::state::{SharedState, StatusSnapshot};
use axum::extract::State;
use axum::http::StatusCode;
use axum::response::{Html, IntoResponse, Json};
use axum::routing::{get, post};
use axum::Router;
use serde::Deserialize;
use tower_http::cors::{Any, CorsLayer};
use tower_http::trace::TraceLayer;

const INDEX_HTML: &str = include_str!("../../ui/index.html");

pub fn build_router(state: SharedState) -> Router {
    Router::new()
        .route("/", get(|| async { Html(INDEX_HTML) }))
        .route("/api/config", get(get_config).put(put_config))
        .route("/api/status", get(get_status))
        .route("/api/osc-test", post(post_osc_test))
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
                "UDP send succeeded. No reply on this socket is normal for Farrago: it usually sends OSC *output* to the address configured under OSC Output, not back to the sender’s ephemeral port—so /ping updates may go nowhere visible unless Output is set. Next: confirm tile paths and add default args (e.g. 1) for /play or /select; same-machine runs can use 127.0.0.1."
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
