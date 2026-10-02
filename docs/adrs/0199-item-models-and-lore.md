# 0199. Item 3D models and lore

**Date:** 2026-10-01
**Status:** Accepted

## Context

Item Shops items render as a Lucide glyph tinted by rarity, or as cover art for Physical Media ([ADR 0099](0099-physical-media-personal-libraries.md)). We want hand-made Blender models for some items, and longer flavor text ("lore") that would crowd the one-line `description` on list rows. The Game State item detail subroute ([ADR 0104](0104-game-state-item-detail-subroute.md)) already gives opted-in items a larger view; it had no place for a 3D model or prose.

Browsers cannot render `.blend`. We own the export pipeline, so we pick the format. Item definitions are `JSON.stringify`'d into Redis and shipped on `USER_GAME_STATE` ([ADR 0097](0097-plugin-contribute-to-user-game-state.md)), so whatever reference we store must stay valid across web deploys.

Alternatives considered:

- **`@google/model-viewer`.** Least code, but its ~71KB gzip excludes the `three` peer it depends on, and it ships lit, AR, and hotspots we will not use.
- **react-three-fiber / Babylon.** Heavier than `three` alone for a single-object viewer.
- **Bundling the GLB with Vite.** Puts binaries in every web deploy and hashes the URL, so the definition could not store it.
- **Runtime S3 pipeline ([ADR 0186](0186-redis-coordination-s3-media.md)).** Built for library covers and previews discovered at runtime. Item models are catalog files committed to git, like Lyric Hero SFX.

## Decision

1. **Two optional fields on `ItemDefinition`:** `model?: string` and `lore?: string`. Authors set them on `definition` in `createItem`. When either is present and `detailView` is omitted, `createItem` sets `detailView: { layout: "default" }`. An explicit `detailView` (for example `punchCard`) is left alone.
2. **`model` is a bare GLB filename** matching `ITEM_MODEL_FILENAME_PATTERN` (`@repo/types`). The source file lives at `packages/plugin-item-shops/items/<shortId>/<model>`. A plugin test fails if an authored `model` is malformed or missing on disk.
3. **Format is glTF Binary (`.glb`).** Blender export: glTF 2.0, Format *glTF Binary*, Images *Automatic* (packed), Apply Modifiers on, Animation off, `+Y` up (exporter default). Keep files under about 2 MB.
4. **Served from the asset CDN, not the web bundle.** The client resolves `${VITE_ASSET_CDN_BASE_URL}/assets/items/<shortId>/<model>` (`resolveItemModelUrl` in `apps/web/src/lib/itemModelUrls.ts`), defaulting to `https://cdn.listeningroom.club`. CloudFront already allows public `GetObject` on `assets/*` and sends CORS for `fetch` ([ADR 0173](0173-asset-cdn-cors-for-browser-decoded-media.md)).
5. **Production web deploy publishes.** `apps/web/netlify.toml` runs `apps/web/scripts/syncItemModels.sh` after the build. It runs `aws s3 sync … --exclude "*" --include "*.glb"` (no `--delete`) only when `CONTEXT=production` and the AWS env is present, so deploy previews and branch builds cannot overwrite live models. When the sync uploaded anything and `ASSET_CDN_DISTRIBUTION_ID` is set, it invalidates `/assets/items/*` (managed `CachingOptimized` holds objects for a day). Netlify env: `ASSET_SYNC_AWS_ACCESS_KEY_ID`, `ASSET_SYNC_AWS_SECRET_ACCESS_KEY`, optional `ASSET_SYNC_AWS_REGION` (default `us-east-1`), `ASSET_S3_BUCKET`, `ASSET_CDN_DISTRIBUTION_ID`. Netlify rejects `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` as reserved names, so the script exports them from the `ASSET_SYNC_*` values before calling the AWS CLI. The sender IAM user (`infra/cdn/main.tf`) gains `s3:ListBucket` limited to the `assets/items/` prefix and `cloudfront:CreateInvalidation` on the asset distribution. No `s3:DeleteObject`.
6. **Viewer is `three` only.** `apps/web/src/lib/itemModelScene.ts` is the only module that imports `three` (renderer, `GLTFLoader`, `OrbitControls`, `RoomEnvironment` as the PMREM environment). `apps/web/src/components/ItemModelViewer.tsx` loads it with a dynamic `import()`, so `three` stays out of the main chunk. *Amended by [0205](0205-shared-model-viewer-and-studio-site-assets.md): the scene and viewer moved to `@repo/model-viewer` (`modelScene.ts`, `ModelViewer`), still the only `three` importer; the web app renders through `AppModelViewer`. Road-trip items publish through the same sync from `packages/plugin-road-trip/items/`.*
   - *Thumbnail* (list rows): spins on Y, no controls, `pointer-events: none`, out of the tab order. Reduced motion (OS setting or the in-app toggle, `useAnimationsEnabled`) stops the spin.
   - *Stage* (detail): `OrbitControls` rotate + zoom, no pan, no auto-rotate. The focusable canvas handles arrow keys (rotate the model) and `+`/`-` (zoom) itself, because `OrbitControls.listenToKeyEvents` maps plain arrows to pan.
   - The Lucide icon shows while the GLB loads and replaces the viewer on load failure, WebGL failure, or context loss.
7. **Precedence in `ItemArtwork`:** cover `imageUrl` (framed or plain), then model, then Lucide `icon`.
8. **Lore renders only on `default` and `punchCard` detail**, under the muted `description`, in full foreground color, newlines kept, URLs linkified. Not on list rows, shop cards, or `trackList` detail.

## Consequences

- Authors add a model by committing a GLB next to the item and setting `model`. It reaches users on the next production web deploy; until then (or if the Netlify AWS env is missing) the icon shows.
- Filenames in Redis stay stable across deploys. Replacing bytes under the same filename relies on the invalidation step; renaming the file also busts the cache.
- `three` is a new client dependency (~150KB gzip), loaded only when an item with a model renders.
- Each visible modeled item holds a WebGL context. If many modeled rows ever hit the browser context cap, the follow-up is a poster image for thumbnails.
- Removing a GLB from git does not delete it from S3; clean up by hand if needed.

## See also

- [0104. Game State item detail subroute](0104-game-state-item-detail-subroute.md)
- [0127. Shared item-detail list row](0127-shared-item-detail-list-row.md)
- [0173. Asset CDN CORS](0173-asset-cdn-cors-for-browser-decoded-media.md)
- [`infra/cdn/README.md`](../../infra/cdn/README.md)
