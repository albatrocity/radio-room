# 0194. Ephemeral Plugin Users and Action Mirroring

**Date:** 2026-08-11
**Status:** Accepted

## Context

Item Shops needs a memorial gag item (“Family Photo”) that spawns short-lived room listeners who mirror a parent user’s chat, reactions, and inventory actions. Other plugins (bingo, loyalty, democracy, quiz) already treat anyone in `online_users` as a participant via `USER_JOINED` / `getUsers()`. Reimplementing those games inside Item Shops would couple plugins. Plugins also cannot create presence, send chat as a user, or add reactions today — only system chat exists. Inclusive quiz/GTT may **drop** a parent message in `transformChatMessage` before later plugins run, so mirroring only from that hook (or from `MESSAGE_RECEIVED`) misses dropped guesses.

## Decision

1. **Ephemeral presence API** on `PluginAPI`:
   - `spawnEphemeralUser(roomId, { username, userId? })` — write Redis user hash (no socket id), add to `online_users`, emit `USER_JOINED`. Do **not** add to `userHistory`.
   - `despawnEphemeralUser(roomId, userId)` — remove from `online_users`, delete user hash, emit `USER_LEFT`.
2. **Impersonation APIs** on `PluginAPI`:
   - `sendChatMessageAsUser` — same pipeline as client send (parse → `CHAT_MESSAGE_SUBMITTED` → transforms → persist/broadcast), without chat-buffer delay.
   - `addReactionAsUser` / `removeReactionAsUser` — reuse reaction operations with the ephemeral user’s identity.
3. **`CHAT_MESSAGE_SUBMITTED` system event** — emitted with `{ roomId, userId, username, content }` after parse and **before** `transformChatMessage`, so plugins can fan out even when a later transform drops the message.
4. **`PersonaDefinition.excludeFromRoomExport`** (optional) — when true, hydrated onto `UserPersona`. `ExportService` omits users whose personas include this flag from export `users` (and `userHistory` if present). Extends ADR 0057 with an explicit export semantic; personas remain non-privileged. Queue Theme’s poll-close quorum also skips holders of these personas so synthetic listeners cannot block unanimous settle.
5. **Durable despawn (Item Shops)** — son lifetime uses `PluginAPI.schedule` / `onScheduled` (ADR 0190) with the spawn graph in plugin storage (`getJson` / `updateJson`, ADR 0192). Process restart reloads the graph and reschedules remaining lifetimes; orphans (persona without a graph record) are despawned on register.

Mirroring, spawn graphs, depth caps, and score funneling stay in the owning plugin (Item Shops). Other game plugins are unchanged.

## Consequences

- Positive: gag effects emerge from real presence; core surface stays small and reusable.
- Positive: export can exclude synthetic listeners without filtering live `getUsers()`.
- Trade-off: ephemeral users without sockets make private DM / tab-attention / per-user sound APIs no-op (existing behavior).
- Trade-off: no delay on mirrored actions can double inclusive awards and democracy votes — intentional for this item.
- See also: [0055](0055-per-socket-login-serialization.md), [0057](0057-user-personas-system.md), [0049](0049-item-shops-and-shopping-sessions.md).
