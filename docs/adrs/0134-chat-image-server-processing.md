# 0134. Chat image server-side resize, compress, and EXIF strip

**Date:** 2026-08-31
**Status:** Accepted

## Context

Chat and room artwork images are uploaded via HTTP multipart and stored as base64 in Redis ([ADR 0003](0003-redis-for-ephemeral-room-data.md)). A **4MB** multer and client cap blocked most iPhone HEIC attachments (often 5–15MB). HEIC-to-JPEG conversion existed but ran only after that cap. Browsers cannot decode HEIC client-side, so processing must happen on the server before `storeImage`.

## Decision

1. **Raise inbound cap to 20MB** per file (`CHAT_IMAGE_UPLOAD_MAX_BYTES` in `@repo/types`). Multer and the web client share this constant.
2. **Process before Redis** in `packages/server/operations/data/prepareRoomImage.ts`:
   - HEIC/HEIF: decode with `heic-convert` (Alpine-safe; do not rely on sharp/libvips HEIF).
   - Raster (JPEG, PNG, WebP, BMP, and HEIC after decode): `sharp` applies EXIF orientation (`rotate()`), resizes to max long edge **1600px**, outputs **JPEG quality 80** with metadata stripped (no `.withMetadata()`).
   - GIF and SVG: pass through unchanged if ≤ **4MB** (`CHAT_IMAGE_UNPROCESSED_MAX_BYTES`); do not run sharp on SVG.
3. **Same pipeline** for chat (`POST /api/rooms/:roomId/images`) and room artwork (`POST .../artwork`). PluginAPI playlist/album cover rehosting is unchanged.
4. **`sharp`** is a direct dependency of `@repo/server`. `heic-convert` remains for HEIC decode only.
5. Multer `LIMIT_FILE_SIZE` returns HTTP **413** with a JSON error body.

## Consequences

- Phone HEICs upload successfully and Redis stores ~100–400KB JPEGs instead of multi-MB originals.
- GPS and camera EXIF are not persisted in Redis.
- PNG with alpha becomes JPEG (acceptable for chat photos); animated GIFs stay GIF.
- Peak memory is one 20MB buffer plus decode per file (sequential upload loop unchanged).
- HEIC is decoded twice (heic-convert then sharp resize) — acceptable vs dropping heic-convert on Alpine.

## See also

- [`packages/server/operations/data/prepareRoomImage.ts`](../../packages/server/operations/data/prepareRoomImage.ts)
- [`packages/types/ChatImage.ts`](../../packages/types/ChatImage.ts)
- [`packages/server/controllers/imageController.ts`](../../packages/server/controllers/imageController.ts)
