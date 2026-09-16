# 0178. Media Bridge TTS (`say`) to a dedicated CoreAudio output

**Date:** 2026-09-15
**Status:** Accepted

## Context

Spy World needs a one-shot consumable (**Burner Phone**) that lets a listener send a short line (≤100 characters) plus a macOS voice through the DJ Mac Media Bridge. Audio must land on a **dedicated** CoreAudio device (Loopback / BlackHole / similar) so Audio Hijack can capture it as its own source, without interrupting Physical Media / programme mpv playback and without flipping the Mac’s default output.

macOS `say` cannot target a CoreAudio device; live `say` always plays to the system default. Inventory already collects structured `callContext` via `requiresTarget` ([0045](0045-inventory-item-targeting.md)). Bridge I/O stays on Redis RPC ([0077](0077-bridge-composite-playback-controller.md), [0082](0082-media-bridge-link-via-redis-pubsub.md)); plugins must not publish `BRIDGE:*` themselves. Daemon config/UI lives on the localhost control page ([0079](0079-bridge-daemon-local-control-ui.md) / [0084](0084-dj-mac-single-zip-supervised-bridge.md)).

## Decision

1. **Transport:** New bridge RPC methods `listSayVoices` and `speak`. Shared cap `BRIDGE_SAY_MAX_CHARS = 100`. RPC returns after synthesis succeeds and playback is **queued** — do not wait for mpv to finish (8s RPC timeout).
2. **Audio path:** Offline `say -v <voice> -o <tmpdir>/lr-tts-<uuid>.aiff -- <text>`, then a **second** mpv process (`--no-video --really-quiet --audio-device=<tts.audioDevice>`) plays that file. Unlink the AIFF after mpv exits (or on failure). Never reuse `MpvPlayback`’s `--input-ipc-server` / `mpv.socketPath`; never `pkill mpv`.
3. **Config:** Daemon `tts.audioDevice` (mpv CoreAudio name). Unset/empty ⇒ `speak` fails closed; item is not consumed. Device listing for the control UI is local HTTP only (`GET /api/audio-devices`), not Redis RPC. The daemon does **not** create virtual devices — the DJ installs Loopback/BlackHole and selects it.
4. **Plugin surface:** `PluginAPI.listMediaBridgeSayVoices` / `speakOnMediaBridge`. Socket request/reply `GET_MEDIA_BRIDGE_SAY_VOICES` → `MEDIA_BRIDGE_SAY_VOICES_RESULT` (same-socket; not a system event).
5. **Inventory targeting:** New `requiresTarget: "spokenMessage"` with wire fields `message` and `voice` on `USE_INVENTORY_ITEM`. Consume only after a successful `speak` RPC. Spoken text stays off-chat; room line uses attributed system message ([0149](0149-inventory-peek-flag-and-identity-pierce.md) / [0150](0150-presented-identity-grant.md)).
6. **Serial queue:** One TTS mpv at a time on the daemon; overlapping uses FIFO.

## Consequences

- DJ Mac must have a virtual output configured in the bridge UI before Burner Phone works; fail messages must say so clearly.
- Installed `say` voices differ per Mac — clients fetch the live list; do not hardcode.
- Physical Media keeps playing unless the DJ points TTS at the same CoreAudio device as programme audio (streams mix; music process does not stop).
- Studio-bridge must forward `message` / `voice` and stub voice listing for Game Studio preview.

## See also

- [0045](0045-inventory-item-targeting.md), [0077](0077-bridge-composite-playback-controller.md), [0079](0079-bridge-daemon-local-control-ui.md), [0082](0082-media-bridge-link-via-redis-pubsub.md)
- Spy World SKU: `packages/plugin-item-shops/items/burner-phone`
- Daemon: `apps/bridge-daemon/src/tts.ts`
