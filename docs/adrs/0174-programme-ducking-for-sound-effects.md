# 0174. Programme Ducking for Sound Effects

**Date:** 2026-09-14
**Status:** Accepted

## Context

Physical Media track previews already mute the listener’s in-browser radio/live stream via `previewDucked` on `audioActor` ([ADR 0103](0103-physical-media-track-previews.md)) without flipping the mute control or Volume Manager. Plugin sound effects (`queueSoundEffect`, [ADR 0072](0072-plugin-user-targeted-sound-effects.md)) often play over the same programme (Lyric Hero crowd cues, quiz correct-answer dings, etc.) and need a milder temporary duck so the SFX is audible without silencing the room.

Radio output is an `<audio>` element (MSE or plain fallback). `HTMLMediaElement.volume` is inert on iOS; mute is not ([ADR 0140](0140-radio-element-playback-oscilloscope-tabled.md) decision 3, still in force under [ADR 0141](0141-radio-mse-transport-and-oscilloscope.md)). Web Audio on the radio path is ruled out for lock-screen playback.

## Decision

1. **Optional `duck` on `queueSoundEffect`:** `queueSoundEffect({ url, volume?, userId?, duck? })`. Omit or `false` = no programme duck (today’s behavior). `true` = client ducks programme while that clip plays. Plugins do not choose the amount.

2. **Payload:** When `duck === true`, include `duck: true` on `SOUND_EFFECT_QUEUED` (room-wide SystemEvent and user-targeted private emit). Omit the field otherwise so older clients ignore it and newer clients treat missing as false.

3. **Client mixer:** Replace the boolean `previewDucked` with source-keyed remaining gains on `audioActor` (`duckSources`: `"preview"` | `"sfx"`). Effective gain is `1` when empty, otherwise `Math.min(...values)`. Preview uses remaining gain `0` (full mute via `element.muted`). SFX uses a fixed remaining gain of **0.3** (~70% down). Lowest remaining gain wins when sources overlap.

4. **Apply without UI side effects:** Programme output volume is `userVolume * duckGain`; programme muted is `userMuted || duckGain === 0`. The volume slider and mute button continue to reflect stored user volume/mute only.

5. **iOS:** Full mute (preview / gain 0) still works via `element.muted`. Partial SFX duck is a **no-op** on iOS because `volume` is inert — prefer that over muting the whole stream for short cues.

6. **Does not supersede** ADR 0103 or ADR 0072; this generalizes the client ducking path from 0103 and extends the 0072 event shape.

## Consequences

- Plugins that play SFX over radio should pass `duck: true` so cues sit on top of programme.
- DJ-Mac Loopback sidechain ducking ([ADR 0109](0109-local-remote-loopback-sidechain-ducking.md)) remains a separate engine; this ADR is browser-only.
- iOS listeners hear SFX at their hardware radio level without a programme duck; desktop/Android get the intended partial duck.

## See also

- [0103](0103-physical-media-track-previews.md) — Physical Media preview mute
- [0072](0072-plugin-user-targeted-sound-effects.md) — `queueSoundEffect` delivery
- [0140](0140-radio-element-playback-oscilloscope-tabled.md) / [0141](0141-radio-mse-transport-and-oscilloscope.md) — radio element volume/mute constraints
