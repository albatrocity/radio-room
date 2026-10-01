#!/usr/bin/env bash
# Publish Item Shops GLBs to the asset CDN (ADR 0199). Runs after the Netlify
# web build from the repo root; only production deploys upload, so deploy
# previews and branch builds can never overwrite live models. No --delete:
# removing a GLB from git leaves the CDN object in place.
set -euo pipefail

ITEMS_DIR="packages/plugin-item-shops/items"
PREFIX="assets/items"

log() { echo "[item-models] $*"; }

if [[ "${CONTEXT:-}" != "production" ]]; then
  log "skip: CONTEXT=${CONTEXT:-unset}"
  exit 0
fi
for var in ASSET_S3_BUCKET ASSET_SYNC_AWS_ACCESS_KEY_ID ASSET_SYNC_AWS_SECRET_ACCESS_KEY; do
  if [[ -z "${!var:-}" ]]; then
    log "skip: $var is not set"
    exit 0
  fi
done
if ! find "$ITEMS_DIR" -name '*.glb' -print -quit | grep -q .; then
  log "skip: no .glb files under $ITEMS_DIR"
  exit 0
fi

if ! command -v aws >/dev/null 2>&1; then
  tmp="$(mktemp -d)"
  log "installing AWS CLI into $tmp"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "$tmp/awscli.zip"
  unzip -q "$tmp/awscli.zip" -d "$tmp"
  "$tmp/aws/install" --install-dir "$tmp/aws-cli" --bin-dir "$tmp/bin" >/dev/null
  export PATH="$tmp/bin:$PATH"
fi

# Netlify reserves the AWS_* names, so the credentials arrive under ASSET_SYNC_*.
export AWS_ACCESS_KEY_ID="$ASSET_SYNC_AWS_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$ASSET_SYNC_AWS_SECRET_ACCESS_KEY"
export AWS_REGION="${ASSET_SYNC_AWS_REGION:-us-east-1}"

output="$(aws s3 sync "$ITEMS_DIR" "s3://$ASSET_S3_BUCKET/$PREFIX" \
  --exclude '*' --include '*.glb' \
  --content-type model/gltf-binary \
  --no-progress)"
if [[ -n "$output" ]]; then echo "$output"; fi

if ! grep -q '^upload:' <<<"$output"; then
  log "CDN already up to date"
  exit 0
fi

if [[ -z "${ASSET_CDN_DISTRIBUTION_ID:-}" ]]; then
  log "warning: ASSET_CDN_DISTRIBUTION_ID is not set; replaced files may stay cached for up to a day"
  exit 0
fi
aws cloudfront create-invalidation \
  --distribution-id "$ASSET_CDN_DISTRIBUTION_ID" \
  --paths "/$PREFIX/*" >/dev/null
log "invalidated /$PREFIX/*"
