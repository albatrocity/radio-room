//! Rapid-pings Farrago while any tile is actively playing so that
//! play state stays fresh and the UI reflects real-time status.

use crate::osc_send::send_osc_datagram;
use crate::state::SharedState;
use std::time::Duration;
use tokio::time::sleep;
use tracing::{debug, warn};

const POLL_INTERVAL: Duration = Duration::from_millis(500);
const SETTLE_DELAY: Duration = Duration::from_millis(250);

/// After a play command, keep pinging for at least this many cycles
/// even if no tiles appear playing yet (Farrago might not have responded).
const MIN_PINGS: u32 = 4;

pub async fn run_play_monitor(state: SharedState) {
    loop {
        state.play_started.notified().await;
        debug!("play monitor: woke up, starting rapid-ping cycle");

        sleep(SETTLE_DELAY).await;

        let mut pings_since_play = 0u32;

        loop {
            let (enabled, host, port) = match state.config.read() {
                Ok(c) => (
                    c.features.soundboard.enabled && c.features.osc.enabled,
                    c.features.osc.host.clone(),
                    c.features.osc.port,
                ),
                Err(_) => break,
            };

            if !enabled || port == 0 {
                break;
            }

            if let Err(e) = send_osc_datagram(&host, port, "/ping", &[]).await {
                warn!(error = %e, "play monitor: ping failed");
            }
            pings_since_play += 1;

            sleep(POLL_INTERVAL).await;

            let any_playing = state.has_any_playing();
            if !any_playing && pings_since_play >= MIN_PINGS {
                debug!("play monitor: no tiles playing, stopping rapid-ping");
                break;
            }
        }
    }
}
