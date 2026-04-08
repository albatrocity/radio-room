#!/usr/bin/env bash
# Run from your machine after you can SSH into the droplet as root (see infra/mediamtx/README.md).
# Usage: chmod +x provision-droplet-remote.sh && REMOTE=root@YOUR_DROPLET_IP ./provision-droplet-remote.sh
set -euo pipefail

REMOTE="${REMOTE:?Set REMOTE, e.g. REMOTE=root@203.0.113.10}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MEDIAMTX_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
CONFIG_SRC="${MEDIAMTX_DIR}/mediamtx.production.example.yml"
CADDYFILE_SRC="${MEDIAMTX_DIR}/Caddyfile"

if [[ ! -f "${CONFIG_SRC}" ]]; then
  echo "Missing ${CONFIG_SRC}" >&2
  exit 1
fi

echo "==> Installing Docker on ${REMOTE} (if needed)..."
ssh "${REMOTE}" 'command -v docker >/dev/null 2>&1 || curl -fsSL https://get.docker.com | sudo sh'

echo "==> Installing Caddy on ${REMOTE} (if needed)..."
ssh "${REMOTE}" 'command -v caddy >/dev/null 2>&1 || (
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl &&
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/gpg.key" | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg &&
  curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt" | tee /etc/apt/sources.list.d/caddy-stable.list &&
  apt-get update &&
  apt-get install -y caddy
)'

echo "==> Configuring Caddy reverse proxy..."
if [[ -f "${CADDYFILE_SRC}" ]]; then
  scp "${CADDYFILE_SRC}" "${REMOTE}:/tmp/Caddyfile"
  ssh "${REMOTE}" 'sudo mv /tmp/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy'
  echo "    Caddyfile deployed and Caddy reloaded."
else
  echo "    WARNING: ${CADDYFILE_SRC} not found, skipping Caddy config."
fi

echo "==> Optional: UFW (uncomment if you use ufw)..."
# ssh "${REMOTE}" 'sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 1935/tcp && sudo ufw allow 8189/udp && sudo ufw --force enable'

echo "==> Installing MediaMTX config to /opt/mediamtx/mediamtx.yml"
ssh "${REMOTE}" 'sudo mkdir -p /opt/mediamtx'
scp "${CONFIG_SRC}" "${REMOTE}:/tmp/mediamtx.yml"
ssh "${REMOTE}" 'sudo mv /tmp/mediamtx.yml /opt/mediamtx/mediamtx.yml && sudo chmod 644 /opt/mediamtx/mediamtx.yml'

echo "==> Edit webrtcAdditionalHosts on the server, then pull your GHCR image or use GitHub Actions deploy."
echo "    ssh ${REMOTE} sudo nano /opt/mediamtx/mediamtx.yml"
