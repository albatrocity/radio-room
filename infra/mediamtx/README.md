# MediaMTX (live rooms)

## Files

| File | Purpose |
|------|---------|
| [`mediamtx.yml`](mediamtx.yml) | Default bundled in the Docker image; fine for local Docker Compose (override via compose volume). |
| [`mediamtx.production.example.yml`](mediamtx.production.example.yml) | Template for the VPS copy at `/opt/mediamtx/mediamtx.yml`. |
| [`Caddyfile`](Caddyfile) | Reverse proxy config deployed to `/etc/caddy/Caddyfile` on the VPS. |

## Production VPS

1. Create `/opt/mediamtx` on the droplet and copy `mediamtx.production.example.yml` to `/opt/mediamtx/mediamtx.yml`.
2. Set `webrtcAdditionalHosts` to the **same hostname** listeners use in the browser (your `A` record or reserved IP).
3. Caddy terminates TLS on **443** and proxies to MediaMTX on localhost. Put **HTTPS** URLs in live room settings so they match your deployed web app (`https://`).

GitHub Actions (`.github/workflows/deploy-mediamtx.yml`) pulls the image and runs the container with `--network host` so MediaMTX shares the host's network stack. This avoids Docker's UDP MASQUERADE rewriting source ports, which breaks WebRTC SRTP delivery. Bind addresses in `mediamtx.yml` control what is publicly reachable: HLS (`127.0.0.1:8888`) and WHEP (`127.0.0.1:8889`) are localhost-only; Caddy handles public HTTPS.

### Caddy (TLS termination)

Caddy runs natively on the droplet (not in Docker) and automatically provisions a **free Let's Encrypt certificate** via ACME HTTP-01. No paid cert or manual renewal required — just ensure **port 80** is open for the challenge.

The [`Caddyfile`](Caddyfile) routes by path:

- Requests ending in `/whep` or `/whip` → `localhost:8889` (MediaMTX WebRTC signaling)
- Everything else → `localhost:8888` (MediaMTX LL-HLS segments and playlists)

**Live room settings** (example with stream key `live`):

| Field | URL |
|-------|-----|
| WebRTC WHEP | `https://stream.listeningroom.club/live/whep` |
| LL-HLS Fallback | `https://stream.listeningroom.club/live/index.m3u8` |

The provision script (`scripts/provision-droplet-remote.sh`) installs Caddy and deploys the Caddyfile automatically.

### GitHub Actions configuration

The workflow (`.github/workflows/deploy-mediamtx.yml`) uses **environment** `rb-radio-listener`. Set values on **Settings → Environments → `rb-radio-listener`** (recommended), or as **repository** secrets/variables under **Settings → Secrets and variables → Actions**.

**`MEDIAMTX_HOST`** — the deploy step reads **`vars.MEDIAMTX_HOST` first**, then **`secrets.MEDIAMTX_HOST`**. The host is not sensitive, so a **Variable** is fine. If you only create a variable named `MEDIAMTX_HOST`, **`secrets.MEDIAMTX_HOST` stays empty**; the old `host: ${{ secrets.MEDIAMTX_HOST }}` pattern caused **appleboy/ssh-action** to fail with `error: missing server host`.

| Name | Type | Required | Purpose |
|------|------|----------|---------|
| `MEDIAMTX_HOST` | **Variable or Secret** | Yes | Droplet public IP, reserved IP, or DNS name for SSH |
| `MEDIAMTX_USER` | Secret | Yes | SSH user (e.g. `root` or `deploy`) |
| `MEDIAMTX_SSH_KEY` | Secret | Yes | Private key (PEM) for that user |
| `MEDIAMTX_GHCR_TOKEN` | Secret | If GHCR package is **private** | PAT with `read:packages`; used on the droplet for `docker login` before `docker pull` |
| `API_URL` | **Variable** | Yes (for stream health) | API server base URL (e.g. `https://api.listeningroom.club`) |
| `STREAM_HEALTH_SECRET` | Secret | Yes (for stream health) | Shared secret for the `POST /api/stream-health` webhook |

Image: `ghcr.io/<owner>/<repo>/mediamtx:latest` (owner/repo are lowercased for GHCR).

### DigitalOcean Droplet (manual or MCP)

**Prefer creating the droplet with SSH keys** (Droplets MCP `droplet-create` accepts `SSHKeys`: key IDs or fingerprints from **Account → Security → SSH keys**). If a droplet was created **without** keys, use the control panel **Access → Launch Droplet Console**, log in as `root`, then install your public key:

```bash
mkdir -p ~/.ssh
echo 'ssh-ed25519 AAAA...your-key... comment' >> ~/.ssh/authorized_keys
chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys
```

After `ssh root@<droplet-ip>` works:

```bash
chmod +x infra/mediamtx/scripts/provision-droplet-remote.sh
REMOTE=root@<droplet-ip> ./infra/mediamtx/scripts/provision-droplet-remote.sh
```

Then on the server: `sudo nano /opt/mediamtx/mediamtx.yml` and set **`webrtcAdditionalHosts`** to the hostname or IP listeners use (match DNS / reserved IP).

**Example MCP create** (adjust `Region`, add `SSHKeys` when possible): Ubuntu 24.04 image id `195932981`, size `s-1vcpu-1gb`, e.g. region `nyc3`.

## Stream health webhook

MediaMTX reports stream liveness to the API server via an HTTP webhook. The `live` path in `mediamtx.yml` uses `runOnReady` and `runOnNotReady` hooks to POST to `POST /api/stream-health` with a Bearer token.

This decouples "is audio flowing?" from "what track is playing?":

- **Stream health** (MediaMTX → API): controls whether a live room shows as online or offline.
- **Now Playing** (local-remote → Redis → adapter-rtmp): provides optional track metadata overlay when a music app is detected.

A live room becomes "online" the moment MediaMTX receives an active publisher on the `live` path, even if no music app metadata is available (e.g. vinyl, talking, non-standard audio sources).

The API server also needs `STREAM_HEALTH_SECRET` set in its environment (e.g. Heroku config var) to validate incoming requests.

## DigitalOcean firewall (inbound)

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH (restrict to your IP if possible) |
| 80 | TCP | Caddy ACME HTTP-01 challenge (Let's Encrypt cert renewal) |
| 443 | TCP | HTTPS — Caddy reverse proxy to MediaMTX WHEP + HLS |
| 1935 | TCP | RTMP ingest |
| 8189 | UDP | WebRTC media |

Ports **8888** (HLS) and **8889** (WHEP) are bound to **127.0.0.1** in `mediamtx.yml`; they are not publicly reachable. All browser traffic goes through **Caddy on 443**. The container runs with `--network host` to avoid Docker NAT issues with WebRTC UDP.
