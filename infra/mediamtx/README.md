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

## DigitalOcean firewall (inbound)

| Port | Protocol | Purpose |
|------|----------|---------|
| 22 | TCP | SSH (restrict to your IP if possible) |
| 1935 | TCP | RTMP ingest |
| 8888 | TCP | LL-HLS (or only localhost if proxied) |
| 8889 | TCP | WHEP signaling (or only localhost if proxied) |
| 8189 | UDP | WebRTC media |

If you terminate TLS on the host and only expose 443, still allow **8189/udp** and map proxies to 8888/8889 on localhost.
