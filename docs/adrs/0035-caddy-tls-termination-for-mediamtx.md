# 0035. Caddy TLS Termination for MediaMTX

**Date:** 2026-04-08
**Status:** Accepted

## Context

Live rooms serve WebRTC (WHEP) and LL-HLS from a MediaMTX instance on a DigitalOcean droplet. The Listening Room web app is served over HTTPS (`https://www.listeningroom.club`). Browsers block mixed content: an HTTPS page cannot `fetch()` an `http://` WHEP endpoint or load `http://` HLS segments. MediaMTX does not natively terminate TLS; it serves plain HTTP on ports 8888 (HLS) and 8889 (WHEP).

Without a TLS-terminating reverse proxy, WebRTC signaling fails with SSL errors and HLS is blocked as mixed content. The stream host (`stream.listeningroom.club`) needs to serve HTTPS on port 443.

## Decision

### Caddy as a native reverse proxy

Install [Caddy](https://caddyserver.com/) directly on the droplet (not in Docker). Caddy:

- Automatically provisions and renews a **free Let's Encrypt certificate** via ACME HTTP-01. No paid certificate, no manual renewal, and no dependency on the Netlify wildcard cert.
- Listens on **port 443** and terminates TLS for `stream.listeningroom.club`.
- Routes requests by path: `/whep` and `/whip` suffixes go to `localhost:8889` (MediaMTX WHEP/WHIP); everything else goes to `localhost:8888` (MediaMTX LL-HLS).

### Localhost-only binding for MediaMTX HTTP ports

The Docker container binds ports 8888 and 8889 to `127.0.0.1` only (`-p 127.0.0.1:8888:8888`). Raw HTTP is never exposed to the public internet. RTMP (1935/tcp) and WebRTC media (8189/udp) remain publicly bound since they are not HTTP and not subject to mixed-content restrictions.

### Firewall changes

Port 80/tcp is opened for ACME challenges. Port 443/tcp is opened for HTTPS. Ports 8888 and 8889 no longer need to be publicly accessible.

### Caddyfile checked into the repo

The Caddyfile lives at `infra/mediamtx/Caddyfile` and is deployed to `/etc/caddy/Caddyfile` by the provision script. The GitHub Actions deploy workflow reloads Caddy after restarting the MediaMTX container.

## Consequences

- Browsers on `https://www.listeningroom.club` can reach WHEP and HLS endpoints on `https://stream.listeningroom.club` without mixed-content errors.
- WebRTC signaling (WHEP POST) works from secure contexts; ICE media still uses UDP 8189 directly (not proxied).
- Certificate provisioning and renewal are fully automatic with zero ongoing cost.
- Caddy is installed natively (via apt) rather than in Docker, avoiding Docker-in-Docker complexity for cert storage and simplifying systemd lifecycle management.
- The provision script and deploy workflow both manage the Caddyfile, keeping infra-as-code in sync with the running server.
- Room settings use `https://stream.listeningroom.club/{streamKey}/whep` and `https://stream.listeningroom.club/{streamKey}/index.m3u8` — no port numbers in URLs.
