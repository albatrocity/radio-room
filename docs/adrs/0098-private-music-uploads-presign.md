# 0098. Private Music Uploads via Presigned S3 PUT

**Date:** 2026-08-26
**Status:** Accepted

## Context

Room admins need to designate users as music uploaders who can send audio files and archives (up to 800MB) to object storage for later retrieval via SFTP/AWS tooling. Objects must not be publicly readable via the newsletter CDN, should expire after 30 days, and upload privilege is managed via the plugin persona system ([ADR 0057](0057-user-personas-system.md)).

Existing newsletter presign flow ([AssetUploadService](../packages/server/services/AssetUploadService.ts)) returns CloudFront URLs for public images. Music uploads require a private `uploads/` prefix excluded from CloudFront GetObject.

## Decision

1. **Plugin owns policy and UX state** — `@repo/plugin-music-upload` registers an admin-assignable `uploader` persona, syncs `uploaderUserIds` / `uploadingUserIds` in the component store, and renders declarative badges/buttons. Personas are identity labels only; presign authorization re-checks persona assignment server-side.

2. **Core owns transport** — `MusicUploadService` + room-authenticated REST routes issue presigned PUT URLs (no `publicUrl`). Keys: `uploads/{sanitizedUsername}/{yyyy-mm-dd}/{userId}/{uuid}-{filename}`.

3. **Infra privacy** — S3 lifecycle expires `uploads/` after 30 days. CloudFront bucket policy allows GetObject only on `assets/*` and `newsletter/*`, excluding `uploads/*`.

4. **Upload lifecycle events** — Operations emit `MUSIC_UPLOAD_STARTED` / `MUSIC_UPLOAD_COMPLETED` / `MUSIC_UPLOAD_FAILED` system events; the plugin updates `uploadingUserIds` and emits `PLUGIN:music-upload:UPLOAD_STATUS` for client store hydration.

5. **Revocation does not cancel in-flight PUTs** — Persona removal hides upload UI but does not invalidate an already-issued presigned URL or clear active upload badges until complete/fail.

6. **File picker is core React** — Plugins cannot host `<input type="file">`; the web app renders `MusicUploadPanel` when the plugin upload modal opens.

## Consequences

- Uploaders PUT directly to S3; API never proxies file bytes.
- Allowed MIME types: common audio + zip/rar/7z (enforced at presign).
- Retrieval is out-of-band; no download URLs in the app.
- CORS origins must include the web app ([infra/cdn](../infra/cdn/)).

## See also

- [0006. Plugin system](0006-plugin-system-for-room-features.md)
- [0057. User personas](0057-user-personas-system.md)
- [0092. showWhen membership](0092-plugin-showwhen-membership-and-add-to-queue-area.md)

## Manual verification

1. Enable **Music Upload** on a room; assign **Uploader** via admin listener menu.
2. As uploader, use **Upload music** above chat; send a small `.mp3` or `.zip`.
3. Confirm S3 key under `uploads/{username}/{date}/{userId}/…`.
4. Confirm CDN cannot fetch `uploads/*` keys; `assets/` still works.
5. Admins see **Uploading** badge during PUT; clears after complete.
6. Removing Uploader mid-upload hides controls but does not abort the PUT.
