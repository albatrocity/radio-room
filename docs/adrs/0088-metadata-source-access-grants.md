# 0088. Metadata source access grants

**Date:** 2026-08-02
**Status:** Accepted

## Context

Bridge rooms expose multiple metadata services (Spotify, YouTube, Tidal, local). ADR 0087 defines **availability** (`metadataSourceIds` ∩ daemon CAPABILITIES). Rooms also need **who may search/queue** those services—e.g. YouTube admins-only, a persona that unlocks YouTube, or an inventory pass for one local-library queue.

Personas are identity labels only ([ADR 0057](0057-user-personas-system.md)); they must not become core privileges. A hard-coded `adminOnlyMetadataSourceIds` field would cover room config but not persona/item grants and would not let plugins discover services dynamically.

## Decision

1. **Two concerns stay separate:**
   - **Availability** (0087): which sources exist for the room.
   - **Access** (this ADR): who may `search` / `queue` an available source.
2. **Bridge-only baseline** on the room: `metadataSourceAccess?: Record<sourceId, "open" | "restricted">`. Omitted or `open` = anyone who can use Add to Queue; `restricted` = room admins plus plugin grants. Cleared when leaving the Media Bridge controller. Non-bridge rooms ignore the field (all enabled sources behave as open).
3. **Evaluation** (`MetadataSourceAccessService`) for bridge rooms:
   - Source not in enabled set (policy ∩ CAPABILITIES) → deny
   - Room admin → allow
   - Mode `open` / unset → allow
   - Mode `restricted` → allow iff any plugin `grantMetadataSourceAccess` returns `grant`; else deny
   - Grant hook errors/timeouts → abstain (fail-closed for grants; unlike queue-hygiene fail-open)
4. **Plugin surfaces:**
   - `PluginAPI.listMetadataSources(roomId)` → catalog `{ id, label }[]` (policy ∩ CAPABILITIES, not per-user)
   - `grantMetadataSourceAccess?({ roomId, userId, sourceId, action })` → `"grant" | "abstain"`; any grant wins
5. **Personas** remain labels. Plugins may condition grants on persona membership they own; core never maps persona → service.
6. **`QueueValidationParams.mediaSourceType`** is passed through so consumable grants can key off source after access allows.
7. **Enforcement** on `searchForTrack` and `queueSong`; clients use a server-provided per-user effective source list for tabs (not trusted as auth).

## Consequences

- Room Content UI can mark sources Restricted without a new plugin.
- Plugins can unlock restricted sources via personas, inventory, or custom rules using `listMetadataSources` for discovery.
- Grant aggregation is fail-closed; a broken grant plugin cannot open restricted sources.
- Leaving bridge clears access map so stale restrictions do not linger on Spotify Connect rooms.

## See also

- [0089. Metadata source content browse](0089-metadata-source-content-browse.md) (browse reuses `search` access)
- [0057. User Personas System](0057-user-personas-system.md)
- [0087. Room-level Media Bridge source policy](0087-room-bridge-media-source-policy.md)
- [0006. Plugin system for room features](0006-plugin-system-for-room-features.md)
- [0042. Game Sessions and Inventory](0042-game-sessions-and-inventory.md)
- [`packages/server/services/MetadataSourceAccessService.ts`](../../packages/server/services/MetadataSourceAccessService.ts)
