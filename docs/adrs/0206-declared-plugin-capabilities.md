# 0206. Declared plugin capabilities; `shopAccess`

**Date:** 2026-10-02
**Status:** Accepted. Amended 2026-10-16 (composed offers). Partially superseded by [0214](0214-physical-media-carry.md)

> **Partially superseded by [0214](0214-physical-media-carry.md):** `shopIds` is gone from `openRoomShop` and `validateShop`, along with the `unknown-shop` reason. Requests take `offers` and/or a `physicalMedia` carry, and every scoped round is one composed shop. [0215](0215-van-shared-playback-formats.md) adds `setSharedPlayback`.

## Context

Road trips ([0210](0210-road-trips-v1.md)) open a shop when the van stops at a site. Item Shops already owns shops, shopping rounds, per-user instances, late joiners, and auto-shop ([0049](0049-item-shops-and-shopping-sessions.md)). Building a second shop in road-trip would split shopping across two tabs and two code paths.

Plugins had no supported way to ask each other for anything. The options were:

- **Look up the other plugin's instance through the registry and call its methods.** This couples plugins to each other's internals, and nothing stops a caller from reaching any public method.
- **Emit an event and hope the other plugin listens.** There is no return value, so the caller can't tell "disabled" from "unknown shop".
- **Move room shops into core.** That is a large change for one caller.

## Decision

1. **Plugins declare capabilities.** `Plugin.capabilities?: PluginCapabilities` maps a capability name to an object of async methods. `PluginCapabilities` in `@repo/types` (`Capabilities.ts`) is the closed list of capabilities and their method signatures. Adding a capability means adding it there.
2. **The registry routes requests.** `api.requestCapability(roomId, capability, method, ...args)` is typed from `PluginCapabilities`. It finds the plugin that declares the capability, initializes that plugin's room instance if needed, and calls the method.
   - The result is `{ ok: true, value, provider }` or `{ ok: false, reason: "unsupported" | "error", message? }`. It never throws.
   - If two plugins declare the same capability, the first registered wins and the registry logs a warning.
   - Callers can reach only methods that are declared. There is no instance lookup.
3. **`shopAccess` is the first capability.** Item Shops declares it in `roomShop.ts`:
   - `openRoomShop({ scopeId, title?, shopIds?, offers?, buybackRate?, sample?, openingMessage? })` opens a room-wide shopping round. At least one of `shopIds` or `offers` is required; `offers`, `buybackRate`, and `sample` are covered in point 4 and the amendment below. It goes through the existing round path with eligible shops limited to `shopIds`, so each user gets their own sampled offers and late joiners are covered as today. It returns `{ ok: false, reason: "disabled" | "unknown-shop" | "unknown-item" | "unavailable" | "no-session" }` when it can't open the round. `unavailable` means every catalog id is a real shop this room can't open right now, or every offer is gated out of this room type.
   - `closeRoomShop(scopeId)` ends the round only if `scopeId` opened it.
   - `validateShop({ shopIds?, offers? })` checks the ids. Road-trip calls it when a map loads. Unknown ids are errors. Known shops the room can't open right now come back as `{ ok: true, warnings }`. The main case is the Record Store, which Item Shops only stocks on the Media Bridge with derived Physical Media. This way the same map loads in any room, and the stop parks without a shop where it can't open.
   - Auto-shop stands down while a scoped round is open.
4. **Custom offers (Phase 3).** `openRoomShop` and `validateShop` also take `offers: { definitionId, basePrice?, stock? }[]`, any registered item by full definition id. Offers are added to every user's instance, priced from `basePrice` or the item's `coinValue` and scaled by `costScale`, and re-resolved for late joiners. A request with only offers is valid: the round gets a synthetic shop named after `title`. Unknown definition ids are errors (`unknown-item` on open). Item Shops exports the pure `validateRoomShopRequest`, so Game Studio lints offers with the same rules.
5. **Callers handle failure.** Road-trip still parks when the shop can't open. It shows the reason in Quick Access warnings. A map loaded while Item Shops is unavailable loads with a warning, and a map with unknown shop ids fails to load.

## Consequences

- Requests between plugins are explicit, typed, and easy to search for (`requestCapability`). A provider can change internals freely as long as it keeps the declared methods.
- A capability has one provider per server. That is enough for now. Several providers would need a selection rule.
- Game Studio's mock plugin API stubs `requestCapability`, so plugins that call it run in the sandbox.
- This is the pattern for future requests between plugins. Phase 3 extended `shopAccess` with custom offers, and the stretch goal's `PLUGIN_SIGNAL` covers one-way notifications.

## Amendment (2026-10-16) — composed offers

A Trip Map site can build a shop from `offers` alone. Item Shops still owns the round. For items in Item Shops' own catalog, a composed offer follows the same item-level rules as a catalog offer:

- `availableInRoomTypes` drops the offer when the room type is outside the list. The map still loads. `validateShop` warns (`"<name> isn't sold in <roomType> rooms; the van still stops"`). If every offer is dropped and the site names no catalog shop, `openRoomShop` returns `unavailable`.
- `decorateOffer` runs, so Physical Media gets a rolled condition and a condition price.
- Items from other plugins have no catalog entry. They are ungated and undecorated.

Shop-level purchase effects do not follow an item. Sweetwater's sales-rep follow-up and the Green Room's end-of-round confiscation run only when that shop is the open visit. Record Store stock built from the room's library is not a registered item, so it is not composable.

`openRoomShop` also takes:

- `buybackRate` (0–1, default 0). An offers-only shop buys back listed offers and anything else at this fraction. Catalog shops in the same request keep their own rates.
- `sample: { count, weights? }`. `offers` becomes a pool. Each traveler, including a late joiner, gets `count` distinct picks (`weights` `"rarity"` or `"even"`). Gating and decoration run on the pool first. A catalog shop in the same request still samples on its own; the composed picks are appended, not merged into that pool.
