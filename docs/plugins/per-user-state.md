# Per-User Plugin State

Private per-user data (bingo cards, shop visits, etc.) must **not** go in the room-wide plugin component store — that store fans out to every client. Use `contributeToUserGameState` instead ([ADR 0097](../adrs/0097-plugin-contribute-to-user-game-state.md)).

## When to use

| Need | Mechanism |
| ---- | --------- |
| Public room UI (leaderboards, status) | `getComponentState` + `storeKeys` + `emit` |
| Private per-user UI in the game-state modal | `contributeToUserGameState` |
| Badge a game-state tab for one user | `api.requestGameStateTabAttention` |

## Hook

```typescript
async contributeToUserGameState(
  userId: string,
  ctx: { itemDefinitions: ItemDefinition[] },
): Promise<Record<string, unknown> | null> {
  const card = await this.loadCard(userId)
  return { card }
}
```

- Return a bag merged under `pluginUserState[this.name]` on `USER_GAME_STATE`.
- Return `null` / `undefined` / `{}` to contribute nothing.
- Use `ctx.itemDefinitions` when you need definitions (already loaded for the payload) — do not re-fetch inventory definitions. The payload is a **filtered** slice (inventory + modifiers + plugin extras), not the full room catalog.
- **Do not** add a default on `BasePlugin`. Implementing the method opts the plugin into automatic refetch invalidation (`typeof === "function"` is the check).

### Extra definitions (shop offers, etc.)

If the client needs `ItemDefinition` rows that the user does not hold yet (e.g. open shop offers for `detailView`), implement:

```typescript
async referencedItemDefinitionIdsForUser(userId: string): Promise<string[]> {
  // return full definition ids, e.g. `${this.name}:${shortId}`
}
```

Core unions those ids with inventory/modifier refs before loading definitions for the payload.

## Invalidation

When a contributor calls `this.emit(...)` / `api.emit(...)`, the server also emits room-wide `USER_GAME_STATE_INVALIDATED` (deduped once per room per event-loop turn). The web `userGameStateMachine` refetches `GET_MY_GAME_STATE` (debounced). Pass `{ invalidatesUserState: false }` when the event does not change any user's contributed bag ([ADR 0154](../adrs/0154-plugin-emit-invalidates-user-state-opt-out.md)).

User-targeted APIs (`sendUserSystemMessage`, `requestGameStateTabAttention`, sound/screen effects with a recipient) do **not** invalidate — use them for per-user signals that must not fan out.

## Reading on the client

Inside the game-state modal:

```tsx
const gs = useUserGameState()
const bag = gs?.getPluginState<{ card: BingoCard | null }>(pluginName)
const card = bag?.card ?? null
```

Template components should take `pluginName` from `usePluginComponentContext()` rather than hardcoding field names.

## Tab attention

```typescript
await this.context.api.requestGameStateTabAttention({
  userId,
  tabId: "bingo-tab", // schema tab id; API prefixes with plugin name
})
```

Emits `PLUGIN_TAB_ATTENTION` to that user's socket only. Pass the schema tab `id` (e.g. `"bingo-tab"`); the API namespaces it as `pluginName:tabId` to match client game-state tab keys. The web provider badges the game session button and the matching plugin tab until viewed.

## Worked examples

- **Item Shops** — `{ currentShopInstance }` from shopping-session storage; offer rarity hydrated from `ctx.itemDefinitions`.
- **Playlist Bingo** — `{ card }` (`PlaylistBingoUserGameState`) from the cards hash while a round is active; covers DM the user and call `requestGameStateTabAttention`.
- **Queue Theme** — `{ theme, isDecoy }` (`QueueThemeUserGameState`) from the briefs hash while a round is active; late joiners share one `ensureBriefFor` path (DM only on `USER_JOINED`).

See also: [Game Sessions](game-sessions.md), [Plugin Components](components.md), [API Reference](api-reference.md).
