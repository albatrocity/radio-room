# 0173. Asset CDN CORS for Browser-Decoded Media

**Date:** 2026-09-14
**Status:** Accepted

## Context

Plugin sound effects queue CDN URLs (e.g. Lyric Hero crowd SFX on `cdn.listeningroom.club/assets/sfx/…`) and the web client plays them with Howler. Howler's default **Web Audio** path fetches and decodes the file; that requires `Access-Control-Allow-Origin` on the response. The asset CDN historically had no CORS response headers (S3 CORS was PUT-only for presigned uploads). Browsers then failed the load (`onloaderror`) while room chat still showed the accompanying system message — SFX appeared “broken” with no audible cue.

`<audio>` / Howler `html5: true` can play cross-origin media without CORS for hearable output, but any future Web Audio / `fetch` / canvas use of CDN assets still needs ACAO.

## Decision

1. **CloudFront response headers policy** on the asset distribution: CORS allowlist for `GET` / `HEAD` / `OPTIONS` using the same `cors_allowed_origins` as S3 PUT CORS (`origin_override = true`).
2. **S3 bucket CORS** also allows `GET` / `HEAD` from those origins (in addition to `PUT`) for any direct-S3 access.
3. **Client SFX playback** uses a plain `HTMLAudioElement` (not Howler). Howler’s HTML5 path is globally patched with `crossOrigin = "anonymous"` for legacy preview/tap needs; that forces CORS on every Howl and breaks CDN hosts without ACAO. Unlock audio on the guess click (`unlockPreviewAudio`) so async `SOUND_EFFECT_QUEUED` can play after the socket round-trip.

## Consequences

- Lyric Hero and other plugins can host SFX on the Listening Room asset CDN.
- Admins must `terraform apply` in `infra/cdn` for CloudFront CORS to land; SFX already play via plain `Audio` without waiting on that apply.
- Keep `cors_allowed_origins` in sync for both upload PUT and CDN GET (local web + prod web + scheduler).
- Do not route plugin SFX through Howler while `ensureHowlerHtml5Cors` stamps `crossOrigin=anonymous` on all Howl HTML5 nodes.

## See also

- [0072](0072-plugin-user-targeted-sound-effects.md) — `queueSoundEffect` delivery
- [0119](0119-private-music-uploads-presign.md) — S3 PUT CORS for uploads
- [`infra/cdn/README.md`](../../infra/cdn/README.md)
