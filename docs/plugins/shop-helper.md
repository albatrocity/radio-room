# Shop Helper


Plugins that sell items for in-game `coin` (e.g. Music Shop) can compose a **`ShopHelper`** from `@repo/plugin-base/helpers` instead of writing stock / purchase / sell logic by hand. The helper:

- Stores per-item stock in plugin storage (`shop:stock:<shortId>`).
- Performs purchase / sell flows atomically and refunds on failure (sold out, can't afford, inventory full).
- Generates declarative UI components for an entire shop tab.
- Provides default `storeKeys` and a `getComponentState` snapshot of stock levels for the renderer.

`ShopHelper` is intentionally **composable** rather than an inheritance layer, so a single plugin can mix multiple helpers (e.g. shop + game) without single-inheritance conflicts.

**`ShopPlugin`:** For a typical coin shop, you can extend **`ShopPlugin<TConfig>`** from `@repo/plugin-base` instead of hand-wiring `ShopHelper`, `executeAction`, `onItemSold`, and stock-related plugin events. It composes `ShopHelper` internally; subclasses provide `shopItems`, `isShopEnabled`, and `isSellingItems`, and may override hooks for item behaviour. See [ADR 0047: ShopPlugin base class](../adrs/0047-shop-plugin-base-class.md). Prefer raw **`ShopHelper`** when you need to compose multiple helpers or avoid a shop-specific base class.

**`ShoppingSessionHelper` (per-user sessions):** If you need **per-listener random shop instances** (ephemeral “rounds” with a few weighted offers) instead of **global per-item stock** for the whole room, use **`ShoppingSessionHelper`** from `@repo/plugin-base/helpers` and extend `BasePlugin` (not `ShopPlugin`). The built-in **Item Shops** plugin (`@repo/plugin-item-shops`) is the reference implementation. See [ADR 0049: Item Shops and Shopping Sessions](../adrs/0049-item-shops-and-shopping-sessions.md).

**Shopping round lifecycle (`ShopCatalogEntry` / item shops):** Each shop definition may implement optional callbacks alongside `onBuy`:

| Hook             | When (Item Shops plugin)                                                                  | Context type         |
| ---------------- | ----------------------------------------------------------------------------------------- | -------------------- |
| `onBuy`          | After a successful purchase                                                               | `ShopBuyContext`     |
| `onSessionStart` | After `startSession` completes, once per shop in that round’s **eligible** catalog subset | `ShopSessionContext` |
| `onSessionEnd`   | When a shopping **round** ends (admin ends sessions or starts a new round while active)   | `ShopSessionContext` |

**`ShopSessionContext`** (from `@repo/plugin-base/helpers`, defined in `@repo/game-logic`) includes `roomId`, `shopId`, **`pluginName`** (use when filtering inventory by `sourcePlugin`), timer helpers (`startTimer`, `getTimer`, `clearTimer`), **`sendSystemMessage`** / **`sendUserSystemMessage`**, shop-scoped state (`getState`, `setState`, `deleteState`, **`getAllStateKeys`**), and **`inventory`** (`getInventory`, `getItemDefinition`, `removeItem`, `giveItem`). These lifecycle hooks are **not** invoked on room **`GAME_SESSION_ENDED`** — the Item Shops plugin clears shop timers and in-memory shop state on game session end and strips inventory separately.

See [SHOP_ITEM_DEVELOPMENT.md](../SHOP_ITEM_DEVELOPMENT.md) for shop authoring in `@repo/plugin-item-shops`.

### `ShopItem`

```typescript
interface ShopItem {
  // Item definition (registered via inventory.registerItemDefinitions)
  definition: Omit<ItemDefinition, "id" | "sourcePlugin">
  // Starting stock per game session (restocked on `restockAll`)
  initialStock: number
  // Fraction of price refunded when sold back (0-1)
  sellBackRatio: number
}
```

### ShopHelper Methods

| Method                                                       | Purpose                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `getItem(shortId)`                                           | Look up the registered `ShopItem`.                                                                                                    |
| `getDefinitionId(shortId)`                                   | Fully-qualified id (`"<plugin>:<shortId>"`).                                                                                          |
| `getSellPrice(shortId, basePrice?)`                          | Computed sell price (`floor(price * sellBackRatio)`).                                                                                 |
| `registerItems()`                                            | Forwards every item definition to `inventory.registerItemDefinitions`.                                                                |
| `getStock(shortId)` / `getAllStock()`                        | Read current stock.                                                                                                                   |
| `setStock`, `decrementStock`, `incrementStock`, `restockAll` | Stock mutations (atomic where it matters).                                                                                            |
| `purchase(initiator, shortId, price)`                        | Atomic buy: stock check → coin debit → `giveItem`, with refunds on any failure.                                                       |
| `purchaseCatalogItem(initiator, shortId)`                    | Same as `purchase` using the item’s catalog `coinValue` (common case for fixed prices).                                               |
| `matchBuyAction(action, buyPrefix?)`                         | Returns the `shortId` if `action` matches the generated buy action for an item (default prefix `buy`, e.g. `buySkipToken`).           |
| `sell(initiator, itemId, options?)`                          | Sell-back: validates ownership + source plugin → `removeItem` → coin credit → restock.                                                |
| `generateComponents(options?)`                               | Build declarative UI for every item (heading + description + buy button). Suitable for placing inside a `tab` component's `children`. |
| `getStoreKeys()`                                             | Default store keys to expose to the frontend (`<shortIdCamel>Stock`).                                                                 |
| `getComponentState()`                                        | Stock snapshot for `getComponentState` (per-item stock keys).                                                                         |
| `getComponentStateWithSellPrice(quoteShortId)`               | Stock snapshot plus a `sellPrice` field from `getSellPrice(quoteShortId)` (e.g. for `STOCK_CHANGED` / UI).                            |

### Usage

Define items in a static catalog using `ShopCatalogEntry`, then convert to `ShopItem[]`:

```typescript
// types.ts
import { buildShopItemsFromCatalog, type ShopCatalogEntry, type ShopItem } from "@repo/plugin-base"

export const CATALOG: readonly ShopCatalogEntry[] = [
  {
    shortId: "skip-token",
    name: "Skip Token",
    description: "Skip the currently playing song instantly.",
    stackable: true,
    maxStack: 99,
    tradeable: true,
    consumable: true,
    coinValue: 100,
    icon: "skip-forward",
    initialStock: 3,
    sellBackRatio: 0.5,
  },
]

export function buildShopItems(): ShopItem[] {
  return buildShopItemsFromCatalog(CATALOG)
}

export function getCatalogEntry(shortId: string): ShopCatalogEntry {
  const entry = CATALOG.find((e) => e.shortId === shortId)
  if (!entry) throw new Error(`Unknown item: ${shortId}`)
  return entry
}
```

```typescript
// index.ts
import { BasePlugin, ShopHelper } from "@repo/plugin-base"
import { buildShopItems, getCatalogEntry } from "./types"

class MusicShopPlugin extends BasePlugin<MusicShopConfig> {
  name = "music-shop"
  private shop!: ShopHelper

  async register(context: PluginContext) {
    await super.register(context)
    this.shop = new ShopHelper(this.name, context, buildShopItems())
    this.shop.registerItems()
    this.on("GAME_SESSION_STARTED", () => this.shop.restockAll())
  }

  async executeAction(action: string, initiator?: PluginActionInitiator) {
    if (action === "buySkipToken") {
      const config = await this.getConfig()
      if (!config?.isSellingItems) {
        return { success: false, message: "Shop is closed." }
      }
      const price = getCatalogEntry("skip-token").coinValue
      return this.shop.purchase(initiator, "skip-token", price)
    }
    return { success: false, message: `Unknown action: ${action}` }
  }

  async onItemSold(userId: string, item: InventoryItem) {
    const price = getCatalogEntry("skip-token").coinValue
    return this.shop.sell({ userId }, item.itemId, { basePrice: price })
  }
}
```

### Composing multiple helpers

Because `ShopHelper` is a member rather than a base class, a plugin can hold several helpers without inheritance conflicts:

```typescript
class TriviaPlugin extends BasePlugin<TriviaConfig> {
  private shop!: ShopHelper
  // Future: private rounds!: RoundsHelper
  // Future: private leaderboard!: LeaderboardHelper

  async register(context: PluginContext) {
    await super.register(context)
    this.shop = new ShopHelper(this.name, context, this.hintItems)
    this.shop.registerItems()
  }
}
```

### Recommended `isSellingItems` config flag

Shop plugins should expose a separate boolean for "actively selling" so admins can pause sales without disabling item effects:

| `enabled` | `isSellingItems` | Behavior                                                                 |
| --------- | ---------------- | ------------------------------------------------------------------------ |
| `true`    | `true`           | Shop tab visible, can buy, can use, can sell back.                       |
| `true`    | `false`          | Shop tab hidden, purchases blocked. Items still **usable** and sellable. |
| `false`   | -                | Plugin fully off (item effects also blocked).                            |

The Music Shop plugin's `executeAction("buySkipToken", ...)` rejects when `config.isSellingItems` is false even though the plugin itself is enabled.

---
