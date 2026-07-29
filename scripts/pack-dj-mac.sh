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

This folder is the Listening Room runtime for the DJ Mac.
Audio Hijack should start/stop ONLY `local-remote` (this binary).
Do not install Xcode, Rust, or Node/npm on the DJ Mac for this app.

What's in this folder
---------------------
  local-remote              ← AH entrypoint + control UI on :9876
  runtime/node              ← bundled Node (used only as a child process)
  bridge-daemon/            ← Media Bridge (spawned by local-remote)
  README.txt                ← this file


1. Where to put this folder
--------------------------
Best guess (stable, easy to find, survives Desktop cleanup):

  ~/Applications/listening-room-dj-mac/

Examples that also work:
  /Applications/listening-room-dj-mac/     (needs admin to write)
  ~/Music/listening-room-dj-mac/
  ~/Desktop/listening-room-dj-mac/        (fine for testing; easy to lose)

Keep the whole folder together — `local-remote` looks for
`runtime/node` and `bridge-daemon/daemon.cjs` next to itself.
Do not move only the binary out of the folder.

After AirDrop: unzip, then move/rename the folder into place.
On updates: replace the folder contents (or the whole folder), then
re-run the quarantine clear below if macOS blocks launch again.


2. macOS permissions (required for first launch)
-----------------------------------------------
The binaries are not notarized. After AirDrop / download / unzip,
macOS marks them as quarantined and may refuse to run them.

A) Clear quarantine on the whole folder (do this once after each replace):

  xattr -dr com.apple.quarantine ~/Applications/listening-room-dj-mac

  (Use the real path if you put the folder somewhere else.)

B) If double-click / Terminal still says the app "cannot be opened"
   because it is from an unidentified developer:

  1. Right-click (or Control-click) `local-remote` → Open → Open
     (first launch via right-click Open often clears the block), OR
  2. System Settings → Privacy & Security
  3. Look for a message about `local-remote` being blocked
  4. Click "Open Anyway" (you may need to confirm again)

C) Make sure the binary is executable (usually already set):

  chmod +x ~/Applications/listening-room-dj-mac/local-remote
  chmod +x ~/Applications/listening-room-dj-mac/runtime/node

D) Smoke-test from Terminal before wiring Audio Hijack:

  cd ~/Applications/listening-room-dj-mac
  ./local-remote

  Then open: http://127.0.0.1:9876/
  Stop with Ctrl-C when done testing.

E) Optional Privacy prompts (only if you use these features):
  - Automation / AppleEvents — if the macOS Now Playing *watcher*
    in local-remote is enabled (not needed when Media Bridge owns NP).
  - If macOS prompts for Terminal or `local-remote` controlling other
    apps, allow it for the features you use.

You should NOT need a second permission dance for `runtime/node` if
it lives inside the same folder you already cleared with xattr.


3. Install companion apps (not in this zip)
-------------------------------------------
Install these separately on the DJ Mac. Paths below are the usual
defaults — set them in the Media Bridge section of the UI if different.

Required for typical bridge shows
  Google Chrome
    Install: https://www.google.com/chrome/
    Default path used by the bridge:
      /Applications/Google Chrome.app/Contents/MacOS/Google Chrome

  Audio Hijack (Rogue Amoeba)
    Install: usual .dmg → /Applications/Audio Hijack.app
    Session should capture: Chrome (bridge profile), and mpv if you
    play local library tracks. Metadata: point Track Source at the
    bridge Now Playing.txt (Other Source…), not app auto-detect.

Optional — local library
  Homebrew (if you want brew installs): https://brew.sh
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    On Intel Macs, brew usually lives at /usr/local/bin/brew

  mpv
    brew install mpv
    Typical path (Intel Homebrew): /usr/local/bin/mpv
    Typical path (Apple Silicon brew on a different machine): /opt/homebrew/bin/mpv
    Put the path in Media Bridge → mpv path in the UI.

  Navidrome
    brew install navidrome
    Or download a release and run as a user service / LaunchAgent.
    Default web UI: http://127.0.0.1:4533
    Point MusicFolder at your library (e.g. ~/Music/Library) and use
    the same absolute path in the Media Bridge "music folder" field.

Optional — other services
  Spotify.app — /Applications/Spotify.app
    (Often unused when bridge Spotify SDK device is enabled in Chrome.)
  TIDAL.app — /Applications/TIDAL.app
    (Only if you enable the tidal service; CDP port defaults to 9223.)
  Farrago — /Applications/Farrago.app
    (Only for OSC soundboard / segment triggers via local-remote.)


4. Wire Audio Hijack to this pack
---------------------------------
1. In Audio Hijack, add an On Launch / schedule action that runs:

     ~/Applications/listening-room-dj-mac/local-remote

   Use the full path to YOUR folder. Do not point AH at runtime/node
   or at bridge-daemon.

2. Capture audio sources into the same mix as the stream:
   - Google Chrome (the instance the bridge launches)
   - mpv (if using Navidrome/local tracks)

3. For stream titles: Other Source… → the bridge Now Playing.txt path
   (configured in the UI; often under ~/.config/listening-room-bridge/).


5. First-run checklist
----------------------
1. Place folder (section 1) and clear quarantine (section 2).
2. Install Chrome (+ mpv/Navidrome/etc. as needed) — section 3.
3. Start local-remote (Terminal smoke-test or Audio Hijack).
4. Open http://127.0.0.1:9876/
5. Set Redis URL (same Redis as the Listening Room platform).
6. Enable Media Bridge → Save & apply (spawns bundled Node child).
7. Fill Chrome / services / Navidrome / mpv / Now Playing path.
8. Connect to a bridge room here, or use Admin → Link to Media Bridge
   in the web app.

Bookmarks
  Operator UI:     http://127.0.0.1:9876/
  Soundboard:      http://127.0.0.1:9876/soundboard
  Bridge escape:   http://127.0.0.1:18766/   (optional)

Configs survive zip replace (keep secrets out of this folder):
  ~/Library/Application Support/local-remote/config.json
  ~/.config/listening-room-bridge/config.json


6. Updates
----------
On the build Mac: npm run pack:dj-mac
AirDrop the new zip → unzip → replace this folder → run xattr again
if Gatekeeper blocks → restart AH / local-remote.
Config files above are left alone.
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
