//! UDP listener for Farrago OSC Output → update in-memory board state.

use crate::state::SharedState;
use rosc::OscPacket;
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::time::sleep;
use tracing::{debug, info, warn};

/// Max UDP datagram size. Farrago can send large bundles on /ping.
const RECV_BUF_SIZE: usize = 65535;

/// Desired OS-level socket receive buffer (4 MiB). Helps survive burst from /ping.
const SOCKET_RECV_BUF: usize = 4 * 1024 * 1024;

pub async fn run_osc_listener(state: SharedState) {
    loop {
        let (enabled, port) = match state.config.read() {
            Ok(c) => (
                c.features.soundboard.enabled,
                c.features.soundboard.osc_listen_port,
            ),
            Err(_) => (false, 0u16),
        };

        if !enabled || port == 0 {
            state.reconnect.notified().await;
            continue;
        }

        let std_sock = match std::net::UdpSocket::bind(format!("0.0.0.0:{port}")) {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, port, "OSC listener bind failed; retrying");
                sleep(Duration::from_secs(2)).await;
                continue;
            }
        };
        if let Err(e) = std_sock.set_nonblocking(true) {
            warn!(error = %e, "set_nonblocking failed");
        }
        #[cfg(unix)]
        {
            use std::os::unix::io::AsRawFd;
            let fd = std_sock.as_raw_fd();
            let val: libc::c_int = SOCKET_RECV_BUF as libc::c_int;
            unsafe {
                libc::setsockopt(
                    fd,
                    libc::SOL_SOCKET,
                    libc::SO_RCVBUF,
                    &val as *const _ as *const libc::c_void,
                    std::mem::size_of::<libc::c_int>() as libc::socklen_t,
                );
            }
        }
        let socket = match UdpSocket::from_std(std_sock) {
            Ok(s) => s,
            Err(e) => {
                warn!(error = %e, "from_std UdpSocket failed");
                sleep(Duration::from_secs(2)).await;
                continue;
            }
        };

        info!(port, "OSC listener bound (Farrago OSC Output → this port)");
        let mut buf = vec![0u8; RECV_BUF_SIZE];

        loop {
            let cfg_ok = state.config.read().ok().map(|c| {
                c.features.soundboard.enabled && c.features.soundboard.osc_listen_port == port
            });

            if cfg_ok == Some(false) {
                info!("OSC listener: config disabled or port changed; rebinding");
                break;
            }

            tokio::select! {
                biased;
                _ = state.reconnect.notified() => {
                    let still = state.config.read().ok().map(|c| {
                        c.features.soundboard.enabled && c.features.soundboard.osc_listen_port == port
                    });
                    if still != Some(true) {
                        info!("OSC listener: reconnect requested; rebinding");
                        break;
                    }
                }
                recv = socket.recv_from(&mut buf) => {
                    match recv {
                        Ok((n, _src)) => {
                            match rosc::decoder::decode_udp(&buf[..n]) {
                                Ok((_, packet)) => process_packet(&state, &packet),
                                Err(e) => debug!(error = %e, "OSC decode failed"),
                            }
                        }
                        Err(e) => {
                            warn!(error = %e, "OSC recv_from failed");
                            sleep(Duration::from_millis(200)).await;
                        }
                    }
                }
            }
        }
    }
}

fn process_packet(state: &SharedState, packet: &OscPacket) {
    match packet {
        OscPacket::Message(m) => {
            debug!(addr = %m.addr, "OSC in");
            state.apply_farrago_osc(&m.addr, &m.args);
        }
        OscPacket::Bundle(b) => {
            for inner in &b.content {
                process_packet(state, inner);
            }
        }
    }
}
