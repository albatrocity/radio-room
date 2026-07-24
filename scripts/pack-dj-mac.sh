#!/usr/bin/env bash
# Build a single AirDrop-friendly zip for the Intel DJ Mac:
#   local-remote (x86_64) + bundled Node + bridge-daemon (daemon.cjs + puppeteer-core)
#
# Usage (from monorepo root):
#   ./scripts/pack-dj-mac.sh
#   npm run pack:dj-mac
#
# Requirements on the build Mac: Rust (x86_64-apple-darwin target), npm, curl, shasum, unzip, zip.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE_VERSION="${NODE_VERSION:-22.16.0}"
ARTIFACT_NAME="listening-room-dj-mac"
ZIP_NAME="${ARTIFACT_NAME}-darwin-x64.zip"
OUT_DIR="${ROOT}/dist/${ARTIFACT_NAME}"
CACHE_DIR="${ROOT}/dist/.cache"
NODE_TARBALL="node-v${NODE_VERSION}-darwin-x64.tar.gz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}"
SHASUMS_URL="https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"

echo "==> pack-dj-mac: Node ${NODE_VERSION}, artifact ${ZIP_NAME}"

# --- 1. x86_64 local-remote ---
echo "==> Building local-remote (x86_64-apple-darwin)"
rustup target add x86_64-apple-darwin >/dev/null 2>&1 || true
npm run build:intel -w local-remote
LR_BIN="${ROOT}/apps/local-remote/daemon/target/x86_64-apple-darwin/release/local-remote"
if [[ ! -x "$LR_BIN" ]]; then
  echo "error: expected binary at ${LR_BIN}" >&2
  exit 1
fi

# --- 2. Bundle bridge-daemon ---
echo "==> Bundling bridge-daemon"
npm run bundle -w bridge-daemon
BUNDLE_DIR="${ROOT}/apps/bridge-daemon/dist-bundle"
if [[ ! -f "${BUNDLE_DIR}/daemon.cjs" ]]; then
  echo "error: missing ${BUNDLE_DIR}/daemon.cjs" >&2
  exit 1
fi
echo "==> Installing puppeteer-core into bundle"
(cd "$BUNDLE_DIR" && npm install --omit=dev --no-fund --no-audit)

# --- 3. Download pinned Node darwin-x64 ---
mkdir -p "$CACHE_DIR"
TARBALL_PATH="${CACHE_DIR}/${NODE_TARBALL}"
SHASUMS_PATH="${CACHE_DIR}/SHASUMS256-v${NODE_VERSION}.txt"

if [[ ! -f "$TARBALL_PATH" ]]; then
  echo "==> Downloading ${NODE_URL}"
  curl -fsSL -o "$TARBALL_PATH" "$NODE_URL"
fi
echo "==> Verifying Node tarball checksum"
curl -fsSL -o "$SHASUMS_PATH" "$SHASUMS_URL"
EXPECTED="$(awk -v f="$NODE_TARBALL" '$2 == f { print $1; exit }' "$SHASUMS_PATH")"
if [[ -z "$EXPECTED" ]]; then
  echo "error: could not find checksum for ${NODE_TARBALL} in SHASUMS256.txt" >&2
  exit 1
fi
ACTUAL="$(shasum -a 256 "$TARBALL_PATH" | awk '{ print $1 }')"
if [[ "$ACTUAL" != "$EXPECTED" ]]; then
  echo "error: checksum mismatch for ${NODE_TARBALL}" >&2
  echo "  expected: ${EXPECTED}" >&2
  echo "  actual:   ${ACTUAL}" >&2
  rm -f "$TARBALL_PATH"
  exit 1
fi

NODE_EXTRACT="${CACHE_DIR}/node-v${NODE_VERSION}-darwin-x64"
rm -rf "$NODE_EXTRACT"
tar -xzf "$TARBALL_PATH" -C "$CACHE_DIR"
NODE_BIN="${NODE_EXTRACT}/bin/node"
if [[ ! -x "$NODE_BIN" ]]; then
  echo "error: node binary missing after extract" >&2
  exit 1
fi

# --- 4. Assemble folder ---
echo "==> Assembling ${OUT_DIR}"
rm -rf "$OUT_DIR"
mkdir -p "${OUT_DIR}/runtime" "${OUT_DIR}/bridge-daemon"

cp "$LR_BIN" "${OUT_DIR}/local-remote"
chmod +x "${OUT_DIR}/local-remote"

cp "$NODE_BIN" "${OUT_DIR}/runtime/node"
chmod +x "${OUT_DIR}/runtime/node"

# Copy bundle contents (daemon.cjs, static/, ui/, package.json, node_modules)
rsync -a --delete \
  --exclude '.npm' \
  "${BUNDLE_DIR}/" \
  "${OUT_DIR}/bridge-daemon/"

cat > "${OUT_DIR}/README.txt" <<'EOF'
Listening Room — DJ Mac pack (Intel x86_64)
===========================================

This folder is the only artifact you need on the DJ Mac.
Audio Hijack should start/stop ONLY `local-remote` (this binary).

Operator UI (bookmark this):
  http://127.0.0.1:9876/

Soundboard (same origin):
  http://127.0.0.1:9876/soundboard

Escape hatch (bridge child UI; not required day-to-day):
  http://127.0.0.1:18766/

First run
---------
1. If macOS blocks the binary after AirDrop/unzip, clear quarantine once:
     xattr -dr com.apple.quarantine "/path/to/listening-room-dj-mac"
2. Start `local-remote` (or let Audio Hijack start it).
3. Open http://127.0.0.1:9876/
4. Set Redis URL (same as the platform).
5. Enable **Media Bridge**, Save & apply — local-remote spawns the bundled Node child.
6. Configure Chrome / services / Navidrome / mpv in the Media Bridge sections.
7. Connect to a bridge room (or use Admin → Link to Media Bridge in the web app).

Configs survive zip replace (do not put secrets in this folder):
  ~/Library/Application Support/local-remote/config.json
  ~/.config/listening-room-bridge/config.json

Updates
-------
Rebuild on the Apple Silicon / build Mac with `npm run pack:dj-mac`, AirDrop the new zip,
unzip and replace this folder, then restart local-remote / Audio Hijack.

Not included (install separately on the DJ Mac as needed):
  Google Chrome, Spotify, TIDAL, Navidrome, mpv, Audio Hijack
EOF

# --- 5. Zip ---
mkdir -p "${ROOT}/dist"
ZIP_PATH="${ROOT}/dist/${ZIP_NAME}"
rm -f "$ZIP_PATH"
(
  cd "${ROOT}/dist"
  zip -qry "$ZIP_NAME" "$ARTIFACT_NAME"
)

echo ""
echo "Done: ${ZIP_PATH}"
echo "Size: $(du -h "$ZIP_PATH" | awk '{ print $1 }')"
echo "Unzip on the DJ Mac, then: xattr -dr com.apple.quarantine ${ARTIFACT_NAME}"
echo "AH entrypoint: ${ARTIFACT_NAME}/local-remote"
echo "UI: http://127.0.0.1:9876/"
