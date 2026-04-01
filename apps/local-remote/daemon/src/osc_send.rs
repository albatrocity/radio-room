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
