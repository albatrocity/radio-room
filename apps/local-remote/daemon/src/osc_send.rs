//! Encode OSC packets and send via UDP.

use anyhow::{bail, Context, Result};
use rosc::{OscMessage, OscPacket, OscType};
use std::time::Duration;
use tokio::net::UdpSocket;
use tokio::time::timeout;

pub fn encode_osc_packet(addr: &str, args: &[OscType]) -> Result<Vec<u8>> {
    let msg = OscMessage {
        addr: addr.to_string(),
        args: args.to_vec(),
    };
    rosc::encoder::encode(&OscPacket::Message(msg)).context("encode OSC packet")
}

pub fn default_args_to_osc(default_args: &[f32]) -> Vec<OscType> {
    default_args.iter().copied().map(OscType::Float).collect()
}

/// Farrago button controls (`/play`, `/select`, `/mute`, …) ignore float
/// arguments. Working controllers send a single OSC integer (`typetag` `i`):
/// `1` on, `0` off. See Bitfocus Companion's Farrago module.
const FARRAGO_BUTTONS: &[&str] = &[
    "play",
    "select",
    "back",
    "mute",
    "solo",
    "loop",
    "fadeOut",
    "holdToPlay",
    "toggleAB",
    "allowPausing",
    "playPauseAll",
    "stopAll",
    "previous",
    "next",
    "volumeUp",
    "volumeDown",
    "fadeAll",
    "bringForward",
    "reset",
];

pub fn farrago_button_address(addr: &str) -> bool {
    addr.rsplit('/')
        .next()
        .is_some_and(|endpoint| FARRAGO_BUTTONS.contains(&endpoint))
}

/// Arguments for one outbound OSC message.
///
/// Button addresses always get one integer. An empty list means `1` (play /
/// select). Other addresses keep the configured float list (volume, and so on).
pub fn args_for_osc_address(addr: &str, numeric_args: &[f32]) -> Vec<OscType> {
    if farrago_button_address(addr) {
        let value = numeric_args.first().copied().unwrap_or(1.0);
        let value = if value.is_finite() {
            value.round() as i32
        } else {
            1
        };
        return vec![OscType::Int(value)];
    }
    default_args_to_osc(numeric_args)
}

pub fn describe_osc_args(args: &[OscType]) -> Vec<String> {
    args.iter()
        .map(|arg| match arg {
            OscType::Int(value) => format!("i:{value}"),
            OscType::Float(value) => format!("f:{value}"),
            OscType::Double(value) => format!("d:{value}"),
            OscType::Long(value) => format!("h:{value}"),
            OscType::Bool(value) => format!("b:{value}"),
            OscType::String(value) => format!("s:{value}"),
            other => format!("{other:?}"),
        })
        .collect()
}

fn validate_osc_address(addr: &str) -> Result<()> {
    let t = addr.trim();
    if t.is_empty() {
        bail!("OSC address must be non-empty");
    }
    if !t.starts_with('/') {
        bail!("OSC address must start with '/'");
    }
    Ok(())
}

/// Send one OSC packet to `host:port`. Returns bytes sent.
pub async fn send_osc_datagram(host: &str, port: u16, addr: &str, args: &[OscType]) -> Result<usize> {
    validate_osc_address(addr)?;
    let packet = encode_osc_packet(addr, args)?;
    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .context("OSC udp bind")?;
    let n = sock
        .send_to(&packet, (host, port))
        .await
        .context("OSC udp send")?;
    Ok(n)
}

#[derive(Debug, serde::Serialize)]
pub struct OscTestOutcome {
    pub bytes_sent: usize,
    pub reply_received: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reply_byte_len: Option<usize>,
}

/// Send a test message; optionally wait for any UDP reply (e.g. Farrago after `/ping`).
pub async fn run_osc_connection_test(
    host: &str,
    port: u16,
    address: &str,
    args: &[OscType],
    wait_reply_ms: u64,
) -> Result<OscTestOutcome> {
    validate_osc_address(address)?;
    let packet = encode_osc_packet(address, args)?;
    let sock = UdpSocket::bind("0.0.0.0:0")
        .await
        .context("OSC test udp bind")?;
    let bytes_sent = sock
        .send_to(&packet, (host, port))
        .await
        .context("OSC test udp send")?;

    let mut reply_received = false;
    let mut reply_byte_len = None;
    if wait_reply_ms > 0 {
        let mut buf = [0u8; 4096];
        match timeout(
            Duration::from_millis(wait_reply_ms),
            sock.recv_from(&mut buf),
        )
        .await
        {
            Ok(Ok((n, _))) => {
                reply_received = true;
                reply_byte_len = Some(n);
            }
            Ok(Err(e)) => return Err(e).context("OSC test udp recv"),
            Err(_) => {}
        }
    }

    Ok(OscTestOutcome {
        bytes_sent,
        reply_received,
        reply_byte_len,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn play_address_encodes_as_integer_not_float() {
        let int_packet = encode_osc_packet("/set/0/tile/0/4/play", &[OscType::Int(1)]).unwrap();
        let float_packet =
            encode_osc_packet("/set/0/tile/0/4/play", &[OscType::Float(1.0)]).unwrap();
        assert_eq!(int_packet.len(), 32);
        assert_eq!(float_packet.len(), 32);
        assert_ne!(int_packet, float_packet);
        assert!(int_packet.windows(2).any(|window| window == b",i"));
        assert!(float_packet.windows(2).any(|window| window == b",f"));
    }

    #[test]
    fn button_address_defaults_to_integer_one() {
        assert_eq!(
            args_for_osc_address("/set/0/tile/0/4/play", &[]),
            vec![OscType::Int(1)]
        );
        assert_eq!(
            args_for_osc_address("/set/0/tile/0/4/play", &[1.0]),
            vec![OscType::Int(1)]
        );
        assert_eq!(
            args_for_osc_address("/set/0/tile/0/4/play", &[0.0]),
            vec![OscType::Int(0)]
        );
    }

    #[test]
    fn volume_address_stays_float() {
        assert_eq!(
            args_for_osc_address("/set/0/tile/0/4/volume", &[0.25]),
            vec![OscType::Float(0.25)]
        );
        assert!(args_for_osc_address("/ping", &[]).is_empty());
    }
}
