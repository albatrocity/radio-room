# 0205. Shared ModelViewer and Game Studio–published site art

**Date:** 2026-10-02
**Status:** Accepted

## Context

Road-trip sites ([0200](0200-road-trips-v1.md), [0202](0202-trip-maps-portable-json.md)) have an image and lore, and the visit is the reward for stopping. A 3D model of the site, revealed once the room stops there, makes that reward feel earned. Items already have GLB models and a `three` viewer ([0199](0199-item-models-and-lore.md)), but the viewer lived in `apps/web`, and Game Studio, where maps are authored, needs the same stage to preview a model.

Site art also needs a home. Item models are committed next to their item and published by the production web deploy. Map art belongs to a map file that lives outside the repo, so a designer has to be able to publish it from Game Studio. Pasted URLs from anywhere else can move or disappear between authoring and the show.

Alternatives considered:

- **Copy the viewer into Game Studio.** Two `three` scenes to keep in step, and the "only one `three` importer" rule from 0199 would no longer hold.
- **Browser uploads with presigned URLs from the API.** It needs an authenticated API route and a running backend just to author a map. Game Studio is a local tool with no backend.
- **Commit site art to the repo like item models.** Maps aren't in the repo, and an image change would need a deploy.

## Decision

1. **New package `@repo/model-viewer`.** It holds `modelScene.ts` (moved from `apps/web/src/lib/itemModelScene.ts`) and `ModelViewer` (moved from `ItemModelViewer`). It is the only module in the repo that imports `three`, loaded with a dynamic `import()` so no app's main chunk carries it. `spin` is a prop. The web app's `AppModelViewer` wraps it with the reduced-motion setting, and Game Studio passes `spin={false}`. Both `ItemArtwork` and the new `SiteArtwork` render through `AppModelViewer`.
2. **Sites gain `model: { url }`.** It must be an https `.glb` URL. The plugin projects it as `TripStoreSite.modelUrl` only for visited sites, the same gate as lore (D12a), so the model is part of the reward. `SiteArtwork` in the site detail shows the 3D stage when there is a model, falling back to the image and then the icon. Pins, the strip, and poll cards never render a live model.
3. **Non-CDN art is a lint warning.** `non-cdn-asset` flags a site `imageUrl` or `model.url` that doesn't start with the asset CDN base (`DEFAULT_ASSET_CDN_BASE_URL`, overridable through `LintTripMapDeps.assetBaseUrl`). It's a warning, not an error, so hand-written maps still load.
4. **Game Studio publishes art through a dev-server middleware.** `apps/game-studio/vite/siteAssetsPlugin.ts` serves `GET /__studio/assets` (status) and `POST /__studio/assets?kind=image|model` (raw body). It runs in Node with the designer's own AWS credentials (`AWS_PROFILE`, SSO), so no keys reach the browser.
   - **Only this machine may publish.** The dev server listens on `0.0.0.0`, and a plain POST is a "simple" cross-origin request any web page could send. `vite/studioRequestGuard.ts` therefore requires a loopback socket, an `X-Studio-Request: 1` header (which forces a CORS preflight that Vite refuses for foreign origins), a local `Host` name, and a matching `Origin` when one is sent (which also refuses DNS-rebinding hosts). The same guard covers writes to `/__studio/trip-maps`; map reads stay open so other devices can view them.
   - Images are re-encoded with `sharp`: EXIF rotation applied, fit inside 1600 px, WebP at quality 82. Metadata is dropped.
   - GLBs must have the `glTF` magic, container version 2, and a header length that matches the file, and must be 2 MB or smaller. Inputs are capped at 20 MB.
   - Keys are content-addressed: `assets/maps/sites/<sha256>.<webp|glb>`. A `HeadObject` first makes identical bytes a no-op, and objects are served with `Cache-Control: public, max-age=31536000, immutable`, so they never need invalidation.
   - Without credentials, the status reports "not configured" and the editor still works with pasted URLs.
5. **The editor treats unpublished art as an error.** Dropped files preview from a blob URL while they upload. Blob URLs never enter the draft. An upload that is still running or has failed becomes an editor lint error and disables Copy JSON and Save until it publishes or is discarded.
6. **Designer IAM policy.** `infra/cdn` adds `listening-room-map-designer`: `s3:PutObject` and `s3:GetObject` on `assets/maps/*`, `s3:ListBucket` on that prefix (so a missing key reads as 404, not 403), and no delete. It is attached to the `listening-room-map-designers` group, and its ARN is an output for SSO permission sets. Game Studio's `:8005` origins join `cors_allowed_origins` so the stage can load published GLBs.
7. **Road-trip items use the 0199 pipeline.** `ITEM_MODELS` in `plugin-road-trip/items` names a GLB in `packages/plugin-road-trip/items/<shortId>/`, which sets `model` and the default detail view. `syncItemModels.sh` syncs both item folders into the shared `assets/items/` prefix, and a test keeps road-trip shortIds from colliding with Item Shops folders.

## Consequences

- One `three` scene serves items and sites in the web app and Game Studio.
- Map art is immutable on the CDN. Replacing art writes a new key, and old objects stay in S3, because the designer policy can't delete. Orphans are cheap and not cleaned up.
- A designer needs AWS access with the map-designer policy to publish. Without it they can still author maps with pasted URLs and accept the lint warning.
- The 2 MB GLB cap is enforced at upload only. A hand-written map can point at a larger model.
- Applying the Terraform change (the designer policy, group, and CORS origins) is a manual step.
- No road-trip GLBs exist yet. The plumbing is in place, and authoring the models is separate work.

## See also

- [0199](0199-item-models-and-lore.md) — item models and lore; the viewer this extracts
- [0202](0202-trip-maps-portable-json.md) — Trip Map format and lint
- [infra/cdn/README.md](../../infra/cdn/README.md#trip-map-site-art-assetsmaps)
