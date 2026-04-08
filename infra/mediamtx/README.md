# MediaMTX (live rooms)

## Files

| File | Purpose |
|------|---------|
| [`mediamtx.yml`](mediamtx.yml) | Default bundled in the Docker image; fine for local Docker Compose (override via compose volume). |
| [`mediamtx.production.example.yml`](mediamtx.production.example.yml) | Template for the VPS copy at `/opt/mediamtx/mediamtx.yml`. |

## Production VPS

1. Create `/opt/mediamtx` on the droplet and copy `mediamtx.production.example.yml` to `/opt/mediamtx/mediamtx.yml`.
2. Set `webrtcAdditionalHosts` to the **same hostname** listeners use in the browser (your `A` record or reserved IP).
3. After TLS termination (Caddy/nginx) on 443, put **HTTPS** URLs in live room settings so they match your deployed web app (`https://`).

GitHub Actions (`.github/workflows/deploy-mediamtx.yml`) pulls the image and runs the container with `-v /opt/mediamtx/mediamtx.yml:/mediamtx.yml:ro`.

### GitHub repository secrets

| Secret | Required | Purpose |
|--------|----------|---------|
| `MEDIAMTX_HOST` | Yes | Droplet public IP, reserved IP, or DNS name for SSH |
| `MEDIAMTX_USER` | Yes | SSH user (e.g. `root` or `deploy`) |
| `MEDIAMTX_SSH_KEY` | Yes | Private key (PEM) for that user |
| `MEDIAMTX_GHCR_TOKEN` | If GHCR package is **private** | PAT with `read:packages`; used on the droplet for `docker login` before `docker pull` |

Image: `ghcr.io/<owner>/<repo>/mediamtx:latest` (owner/repo are lowercased for GHCR).

### DigitalOcean Droplet (manual or MCP)

Create a **Basic** Droplet (e.g. Ubuntu 24.04, `s-1vcpu-1gb`), attach your **SSH key**, then copy `mediamtx.production.example.yml` to `/opt/mediamtx/mediamtx.yml` and edit `webrtcAdditionalHosts`. The DigitalOcean **Droplets MCP** in Cursor can list regions/images/sizes and create droplets once your API token is configured in Cursor (do not commit tokens to git — see `.cursor/mcp.json.example`).

## DigitalOcean firewall (inbound)

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH (restrict to your IP if possible) |
| 1935 | TCP | RTMP ingest |
| 8888 | TCP | LL-HLS (or only localhost if proxied) |
| 8889 | TCP | WHEP signaling (or only localhost if proxied) |
| 8189 | UDP | WebRTC media |

If you terminate TLS on the host and only expose 443, still allow **8189/udp** and map proxies to 8888/8889 on localhost.
