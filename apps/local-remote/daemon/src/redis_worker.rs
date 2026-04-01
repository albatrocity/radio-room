use crate::logic::osc_action_for_system_message;
use crate::osc_send::send_osc_datagram;
use crate::state::SharedState;
use futures_util::StreamExt;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{error, info, warn};

const PATTERN: &str = "SYSTEM:*";

pub async fn run_redis_loop(state: SharedState) {
    let mut backoff_secs: u64 = 1;
    loop {
        let cfg = match state.config.read() {
            Ok(g) => Some(g.clone()),
            Err(_) => None,
        };
        let Some(cfg) = cfg else {
            sleep(Duration::from_secs(1)).await;
            continue;
        };

        let client = match redis::Client::open(cfg.redis_url.as_str()) {
            Ok(c) => c,
            Err(e) => {
                state.set_redis_connected(false);
                state.set_redis_error(Some(format!("invalid redis client: {e}")));
                sleep(Duration::from_secs(backoff_secs.min(30))).await;
                backoff_secs = (backoff_secs * 2).min(30);
                continue;
            }
        };

        let mut pubsub = match client.get_async_pubsub().await {
            Ok(p) => p,
            Err(e) => {
                state.set_redis_connected(false);
                state.set_redis_error(Some(format!("redis pubsub connect: {e}")));
                warn!(error = %e, "redis connect failed; retrying");
                sleep(Duration::from_secs(backoff_secs.min(30))).await;
                backoff_secs = (backoff_secs * 2).min(30);
                continue;
            }
        };

        if let Err(e) = pubsub.psubscribe(PATTERN).await {
            state.set_redis_connected(false);
            state.set_redis_error(Some(format!("redis psubscribe: {e}")));
            error!(error = %e, "psubscribe failed");
            sleep(Duration::from_secs(backoff_secs.min(30))).await;
            backoff_secs = (backoff_secs * 2).min(30);
            continue;
        }

        backoff_secs = 1;
        state.set_redis_connected(true);
        state.set_redis_error(None);
        info!("redis: subscribed to {}", PATTERN);

        let mut stream = pubsub.on_message();

        loop {
            tokio::select! {
                biased;
                _ = state.reconnect.notified() => {
                    info!("redis: reconnect requested");
                    break;
                }
                msg = stream.next() => {
                    match msg {
                        None => {
                            warn!("redis: pubsub stream ended");
                            break;
                        }
                        Some(m) => {
                            let channel = m.get_channel_name().to_string();
                            let payload = match m.get_payload::<String>() {
                                Ok(p) => p,
                                Err(e) => {
                                    tracing::debug!(error = %e, "get_payload");
                                    continue;
                                }
                            };
                            handle_message(&state, &channel, &payload).await;
                        }
                    }
                }
            }
        }

        state.set_redis_connected(false);
        sleep(Duration::from_millis(200)).await;
    }
}

async fn handle_message(state: &SharedState, channel: &str, payload: &str) {
    state.record_incoming(channel, payload);
    let cfg = match state.config.read() {
        Ok(g) => g.clone(),
        Err(_) => return,
    };
    let Some((addr, args)) = osc_action_for_system_message(&cfg, channel, payload) else {
        return;
    };

    let host = cfg.features.osc.host.as_str();
    let port = cfg.features.osc.port;
    match send_osc_datagram(host, port, &addr, &args).await {
        Ok(_) => state.record_osc_ok(&addr),
        Err(e) => {
            state.record_osc_error(format!("osc send: {e:#}"));
            warn!(error = %e, "OSC send failed");
        }
    }
}
