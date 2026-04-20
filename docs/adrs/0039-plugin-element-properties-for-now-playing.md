# 0039. Plugin element properties for Now Playing

**Date:** 2026-04-20  
**Status:** Accepted

## Context

Plugins need to influence how the **Now Playing** area renders (e.g. a game mode that obscures title/artist/album until players guess them) without shipping React from plugins or replacing core UI wholesale. The codebase already supported `pluginData` on `QueueItem` and `PluginAugmentationData.styles` for limited style hints; that was not enough for structured behaviors like “obscured until revealed” or role-based bypass.

## Decision

Introduce **`elementProps`** on `PluginAugmentationData`: a map from a small set of **element keys** (`title`, `artist`, `album`, `artwork`) to **`PluginElementProps`**, including:

- `obscured` — UI should redact or mask that slot.
- `obscureBypassRoles` — advisory list of viewer roles (`admin`, `dj`, `creator`, `owner`) for which obscuring should not apply; the **web client** resolves this generically (e.g. `usePluginElementProps`) so Now Playing stays unaware of any specific plugin or its config keys.
- `revealedBy` / `placeholder` — optional metadata when a slot is revealed (e.g. who guessed in chat) or obscured (placeholder text).

Plugins implement `augmentNowPlaying()` and return `{ elementProps: { ... } }` under their namespaced `pluginData` entry (unchanged merge rules in `PluginRegistry`).

The first consumer is **`@repo/plugin-guess-the-tune`**: chat fuzzy-matching, scoring, leaderboard, and `elementProps` driven obscuring.

## Security / trust boundary

- **Obscuring is client-side only.** Full track metadata continues to be delivered to every client in the normal `RoomMeta` / `QueueItem` payloads. A motivated user can read raw values via devtools, network capture, or a modified client.
- **`obscureBypassRoles` is not authorization.** It is a UX hint only; it must not be used to gate sensitive server actions.
- For this project, **that risk is accepted** for casual / party-game plugins. If a plugin required **hard secrecy**, the platform would need **server-side redaction** of broadcast payloads (or per-recipient filtering), which is explicitly **out of scope** for this ADR.

## Consequences

- **Extensible**: New element keys or props can be added without plugins touching React.
- **Composable**: Multiple plugins can contribute `elementProps`; the client merges them (see `usePluginElementProps`).
- **No real secrecy** from `elementProps` alone; room operators must understand the trust model above.
- **Documentation**: Plugin authors should read this ADR before relying on obscuring for anything beyond UX.
