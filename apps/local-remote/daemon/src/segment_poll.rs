use crate::logic::osc_action_for_segment;
use crate::osc_send::send_osc_datagram;
use crate::state::SharedState;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{error, info, warn};

const POLL_INTERVAL: Duration = Duration::from_secs(3);

/// Poll the active segment over HTTP and fire Farrago OSC when it changes.
pub async fn run_segment_poll(state: SharedState) {
    let mut backoff_secs: u64 = 1;
    let mut last_segment_id: Option<String> = None;

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
            state.set_redis_connected(false);
            state.set_redis_error(Some(
                "room id is required to poll the active segment".to_string(),
            ));
            sleep(Duration::from_secs(backoff_secs.min(30))).await;
            continue;
        }
        if cfg.device_ingress_secret.is_empty() {
            state.set_redis_connected(false);
            state.set_redis_error(Some(
                "deviceIngressSecret is empty; set the same bearer as DEVICE_INGRESS_SECRET"
                    .to_string(),
            ));
            sleep(Duration::from_secs(backoff_secs.min(30))).await;
            continue;
        }

        match poll_once(&state, &cfg, &mut last_segment_id).await {
            Ok(()) => {
                backoff_secs = 1;
                state.set_redis_connected(true);
                state.set_redis_error(None);
            }
            Err(e) => {
                state.set_redis_connected(false);
                state.set_redis_error(Some(e.clone()));
                warn!(error = %e, "segment poll failed; retrying");
                sleep(Duration::from_secs(backoff_secs.min(30))).await;
                backoff_secs = (backoff_secs * 2).min(30);
                continue;
            }
        }

        tokio::select! {
            _ = state.reconnect.notified() => {
                info!("segment poll: config changed");
                last_segment_id = None;
            }
            _ = sleep(POLL_INTERVAL) => {}
        }
    }
}

async fn poll_once(
    state: &SharedState,
    cfg: &crate::config::Config,
    last_segment_id: &mut Option<String>,
) -> Result<(), String> {
    let base = cfg.platform_api_base_url.trim_end_matches('/');
    let url = format!(
        "{base}/api/device/active-segment?roomId={}",
        urlencoding_room(&cfg.room_id)
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .map_err(|e| format!("http client: {e}"))?;

    let res = client
        .get(&url)
        .bearer_auth(&cfg.device_ingress_secret)
        .send()
        .await
        .map_err(|e| format!("segment poll: {e}"))?;

    if res.status() == reqwest::StatusCode::NO_CONTENT || res.status() == reqwest::StatusCode::NOT_FOUND
    {
        *last_segment_id = None;
        return Ok(());
    }
    if !res.status().is_success() {
        return Err(format!("segment poll status {}", res.status()));
    }

    let text = res.text().await.map_err(|e| format!("segment body: {e}"))?;
    if text.trim().is_empty() {
        *last_segment_id = None;
        return Ok(());
    }

    state.record_incoming("active-segment", &text);
    let segment_id = segment_id_of(&text);
    if segment_id.is_none() || segment_id == *last_segment_id {
        return Ok(());
    }
    *last_segment_id = segment_id;

    let Some((addr, args)) = osc_action_for_segment(cfg, &text) else {
        return Ok(());
    };
    let host = cfg.features.osc.host.as_str();
    let port = cfg.features.osc.port;
    match send_osc_datagram(host, port, &addr, &args).await {
        Ok(_) => state.record_osc_ok(&addr),
        Err(e) => {
            state.record_osc_error(format!("osc send: {e:#}"));
            error!(error = %e, "OSC send failed");
        }
    }
    Ok(())
}

fn segment_id_of(payload: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(payload).ok()?;
    value
        .get("segmentId")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .filter(|s| !s.is_empty())
}

fn urlencoding_room(room_id: &str) -> String {
    urlencoding_minimal(room_id)
}

fn urlencoding_minimal(value: &str) -> String {
    let mut out = String::new();
    for b in value.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
