# Plugin Development Guide

This guide explains how to create plugins for Listening Room. Plugins extend room functionality through an event-driven architecture with support for custom UI components, configuration forms, and data augmentation.

Documentation is split into focused guides below. Start with [Getting Started](plugins/getting-started.md) if you are new to plugin development.

## Guides

### Essentials

| Guide | Topics |
| ----- | ------ |
| [Getting Started](plugins/getting-started.md) | Architecture overview, quick start, package setup, registration |
| [BasePlugin Reference](plugins/base-plugin.md) | Properties, methods, lifecycle hooks, optional overrides |
| [Event System](plugins/events.md) | System events, game/inventory events, handler examples |
| [Storage API](plugins/storage.md) | Redis namespacing, batch ops, sorted sets |

**Config caching:** `BasePlugin.getConfig()` keeps the merged room config in memory and invalidates it on `CONFIG_CHANGED` for that plugin. Prefer `getConfig()` on chat/track hot paths instead of a subclass-local cache or calling Redis on every event.

### Admin & UI

| Guide | Topics |
| ----- | ------ |
| [Admin Configuration](plugins/admin-config.md) | Config schema, field types, layout, action buttons, Quick Access (`quickAccess`), config import (`configImport` / `parseConfigImportRows`) |
| [Plugin Components](plugins/components.md) | Declarative UI, areas, templates, game state tabs |

### Behavior & Data

| Guide | Topics |
| ----- | ------ |
| [Queue Validation](plugins/queue-validation.md) | Intercepting enqueue requests, fail-open semantics |
| [Metadata Source Access](plugins/metadata-source-access.md) | Restricted sources, plugin grants, `listMetadataSources` / `canAccessMetadataSource` / `getEffectiveMetadataSourceIds`; browse / Search entities use `search` access ([ADR 0089](adrs/0089-metadata-source-content-browse.md), [ADR 0090](adrs/0090-hybrid-metadata-catalog-browse.md)) |
| [Data & Export](plugins/data-and-export.md) | Playlist/now-playing augmentation, room exports |
| [Timer API](plugins/timers.md) | Built-in timer management, countdown patterns |

### Game Systems

| Guide | Topics |
| ----- | ------ |
| [Game Sessions & Inventory](plugins/game-sessions.md) | Shared score/coin, modifiers, items, defense, `onItemUsed` |
| [Per-User State](plugins/per-user-state.md) | `contributeToUserGameState`, `pluginUserState`, invalidation, tab attention |
| [User Personas](plugins/user-personas.md) | Identity labels, badges, admin assignment |
| [Shop Helper](plugins/shop-helper.md) | `ShopHelper`, `ShopPlugin`, coin shops, stock management |

### Reference

| Guide | Topics |
| ----- | ------ |
| [Plugin API Reference](plugins/api-reference.md) | `PluginAPI` methods, sound/screen effects |
| [Best Practices & Examples](plugins/best-practices.md) | Patterns, reference plugins, testing |

## Related Documentation

- [Item Shops Development](SHOP_ITEM_DEVELOPMENT.md) — authoring items and shops in `@repo/plugin-item-shops`
- Playlist Bingo — `@repo/plugin-playlist-bingo` (private cards via `contributeToUserGameState`; [ADR 0096](adrs/0096-playlist-bingo-per-user-cards.md), [ADR 0097](adrs/0097-plugin-contribute-to-user-game-state.md))
- Queue Theme — `@repo/plugin-queue-theme` (per-track theme polls + decoy themes; [ADR 0152](adrs/0152-plugin-authored-core-polls.md), [ADR 0153](adrs/0153-plugin-authored-queue-split.md))
- [ADR 0006: Plugin system](adrs/0006-plugin-system-for-room-features.md)
- [ADR 0042: Game sessions and inventory](adrs/0042-game-sessions-and-inventory.md)
- [ADR 0097: Plugin contributeToUserGameState](adrs/0097-plugin-contribute-to-user-game-state.md)
- [ADR 0154: Plugin emit may skip USER_GAME_STATE_INVALIDATED](adrs/0154-plugin-emit-invalidates-user-state-opt-out.md)
- [ADR 0057: User personas](adrs/0057-user-personas-system.md)
- [ADR 0088: Metadata source access grants](adrs/0088-metadata-source-access-grants.md)
- [ADR 0091: Round Robin DJ plugin](adrs/0091-round-robin-dj-plugin.md) — turn eligibility, Robin persona, `DEPUTY_DJ_CHANGED`
- [ADR 0074: Quick Access admin panels](adrs/0074-quick-access-admin-panels.md) — opt-in room FloatingPanels for curated config actions
- [ADR 0075: Plugin config import actions](adrs/0075-plugin-config-import-actions.md) — schema `configImport`, plugin-owned paste parsers, web execute vs scheduler dry-run API
- [Backend Development](BACKEND_DEVELOPMENT.md) — server architecture, SystemEvents, broadcasters
