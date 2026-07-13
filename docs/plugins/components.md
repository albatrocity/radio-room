# Plugin Components


Define declarative UI components that render in the frontend without React code in your plugin.

### Component Schema

```typescript
import type { PluginComponentSchema, PluginComponentState } from "@repo/types"

getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      // Text with countdown timer
      {
        id: "countdown-text",
        type: "text-block",
        area: "nowPlaying",
        showWhen: { field: "showCountdown", value: true },
        content: [
          { type: "text", content: "React with " },
          { type: "component", name: "emoji", props: { emoji: "{{config.reactionType}}" } },
          { type: "text", content: " to keep playing" },
        ],
      },

      // Countdown timer
      {
        id: "countdown-timer",
        type: "countdown",
        area: "nowPlaying",
        showWhen: { field: "showCountdown", value: true },
        startKey: "trackStartTime",      // Read from store
        duration: "config.timeLimit",     // Read from config
      },

      // Badge
      {
        id: "skipped-badge",
        type: "badge",
        area: "nowPlayingBadge",
        showWhen: { field: "isSkipped", value: true },
        label: "Skipped",
        variant: "warning",
        icon: "skip-forward",
        tooltip: "{{voteCount}}/{{requiredCount}} votes",
      },

      // Button that opens modal
      {
        id: "leaderboard-button",
        type: "button",
        area: "userList",
        showWhen: { field: "enabled", value: true },
        label: "{{config.wordLabel:pluralize:2}} Leaderboard",
        icon: "trophy",
        opensModal: "leaderboard-modal",
      },

      // Modal with nested components
      {
        id: "leaderboard-modal",
        type: "modal",
        area: "userList",
        title: "{{config.wordLabel:pluralize:2}} Leaderboard",
        size: "lg",
        children: [
          {
            id: "users-leaderboard",
            type: "leaderboard",
            area: "userList",
            dataKey: "usersLeaderboard",
            title: "Top Users",
            rowTemplate: [
              { type: "component", name: "username", props: { userId: "{{value}}" } },
              { type: "text", content: ": {{score}} {{config.wordLabel:pluralize:score}}" },
            ],
            maxItems: 10,
            showRank: true,
          },
        ],
      },
    ],

    // Keys that trigger component updates from plugin events
    storeKeys: ["showCountdown", "trackStartTime", "isSkipped", "voteCount", "requiredCount"],
  }
}
```

### Component Areas

| Area              | Location                             | Item Context Available |
| ----------------- | ------------------------------------ | ---------------------- |
| `nowPlaying`      | Below now playing info               | No                     |
| `nowPlayingInfo`  | Inline with now playing details      | No                     |
| `nowPlayingBadge` | Badge area near title                | No                     |
| `nowPlayingArt`   | Overlay on album art                 | No                     |
| `playlistItem`    | Per-track in playlist                | Yes (track data)       |
| `userList`        | User list section                    | No                     |
| `userListItem`    | Per-user in list                     | Yes (user data)        |
| `gameStateTab`    | Tab content in user game state modal | No                     |

### Component Types

| Type               | Description                | Key Props                                                       |
| ------------------ | -------------------------- | --------------------------------------------------------------- |
| `text`             | Inline text                | `content`, `variant`                                            |
| `text-block`       | Block text                 | `content`, `variant`                                            |
| `heading`          | Section heading            | `content`, `level`                                              |
| `emoji`            | Emoji display              | `emoji`, `size`                                                 |
| `icon`             | Icon display               | `icon`, `size`, `color`                                         |
| `button`           | Clickable button           | `label`, `icon`, `opensModal`, `action`                         |
| `badge`            | Status badge               | `label`, `variant`, `icon`, `tooltip`                           |
| `leaderboard`      | Ranked list                | `dataKey`, `title`, `rowTemplate`, `maxItems`                   |
| `countdown`        | Timer display              | `startKey`, `duration`, `text`                                  |
| `modal`            | Dialog container           | `title`, `size`, `children`                                     |
| `tab`              | Tab in game state modal    | `label`, `icon?`, `children` (only in `gameStateTab`)           |
| `game-leaderboard` | Session leaderboard        | `leaderboardId`, `title?`, `maxItems`, `showRank`               |
| `game-attribute`   | One attribute value        | `attribute`, `format?`, `icon?`, `label?`                       |
| `modifier-badge`   | Active modifier hint       | `modifier`, `variant?`, `label?`, `icon?`                       |
| `inventory-button` | Opens inventory modal      | `label`, `opensModal`, `icon?`                                  |
| `inventory-grid`   | Item grid (often in modal) | `showQuantity`, `allowUse`, `allowTrade`, `filterSourcePlugin?` |
| `item-badge`       | Owns-item indicator        | `definitionId`, `showQuantity`                                  |

**Available Icons:**

`trophy`, `star`, `medal`, `award`, `heart`, `skip-forward`, `swords`,
`coins`, `shopping-cart`, `package`

### Per-Item Components

Components in `userListItem` or `playlistItem` areas render once per item (user or track). These areas provide an `itemContext` with item-specific data that can be used in `showWhen` conditions.

#### User List Item Context

For `userListItem` components, the following fields are available:

| Field        | Type      | Description                      |
| ------------ | --------- | -------------------------------- |
| `userId`     | `string`  | The user's unique ID             |
| `isDeputyDj` | `boolean` | Whether the user is a deputy DJ  |
| `isDj`       | `boolean` | Whether the user is currently DJ |
| `isAdmin`    | `boolean` | Whether the user is room admin   |

#### Using Item Context in showWhen

Use the `item.` prefix to check item context values:

```typescript
{
  id: "deputy-badge",
  type: "icon",
  area: "userListItem",
  icon: "star",
  color: "yellow.400",
  showWhen: [
    { field: "enabled", value: true },           // Check plugin config
    { field: "item.isDeputyDj", value: true },   // Check item context
  ],
}
```

#### Example: Competitive Mode Icon

Show a sword icon next to deputy DJs when competitive mode is enabled:

```typescript
getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "competitive-user-icon",
        type: "icon",
        area: "userListItem",
        icon: "swords",
        size: "sm",
        color: "orange.400",
        showWhen: [
          { field: "enabled", value: true },
          { field: "competitiveModeEnabled", value: true },
          { field: "item.isDeputyDj", value: true },
        ],
      },
      // ... other components
    ],
    storeKeys: ["competitiveModeEnabled"],
  }
}
```

The icon will only appear for users where:

1. The plugin is enabled (`config.enabled === true`)
2. Competitive mode is on (`config.competitiveModeEnabled === true` or `store.competitiveModeEnabled === true`)
3. The specific user is a deputy DJ (`itemContext.isDeputyDj === true`)

### Component State

Provide initial state for components:

```typescript
async getComponentState(): Promise<PluginComponentState> {
  if (!this.context) return {}

  const config = await this.getConfig()
  if (!config?.enabled) {
    return { showCountdown: false }
  }

  const nowPlaying = await this.context.api.getNowPlaying(this.context.roomId)

  return {
    showCountdown: true,
    trackStartTime: nowPlaying?.playedAt
      ? new Date(nowPlaying.playedAt).getTime()
      : null,
    isSkipped: false,
    voteCount: 0,
    requiredCount: 5,
  }
}
```

### Updating Component State

Emit plugin events to update component state. The frontend automatically updates `storeKeys` from event payloads:

```typescript
// When track starts
await this.emit("TRACK_STARTED", {
  showCountdown: true,
  trackStartTime: Date.now(),
})

// When track is skipped
await this.emit("TRACK_SKIPPED", {
  isSkipped: true,
  voteCount: 3,
  requiredCount: 5,
})

// When plugin is disabled
await this.emit("PLUGIN_DISABLED", {
  showCountdown: false,
})
```

### Template Interpolation

Use `{{field}}` syntax in component props:

| Syntax                      | Description              |
| --------------------------- | ------------------------ |
| `{{field}}`                 | Simple value             |
| `{{field:duration}}`        | Format as duration       |
| `{{field:percentage}}`      | Format as percentage     |
| `{{field:pluralize:count}}` | Pluralize based on count |
| `{{config.fieldName}}`      | Value from plugin config |

### Composite Templates

Mix text and components:

```typescript
content: [
  { type: "text", content: "User " },
  { type: "component", name: "username", props: { userId: "{{value}}" } },
  { type: "text", content: " scored {{score}} points" },
]
```


## Game State Tabs

The user's **Game State modal** (opened via the game state button in the room header) is a tabbed container. The first tab is always the built-in **Inventory** tab (with attribute stats, items, and Use / Sell buttons). Plugins can register additional tabs declaratively.

### Registering a tab

Use the `gameStateTab` area together with the `tab` component type in `getComponentSchema()`:

```typescript
getComponentSchema(): PluginComponentSchema {
  return {
    components: [
      {
        id: "music-shop-tab",
        type: "tab",
        area: "gameStateTab",
        label: "Shop",
        icon: "shopping-cart",
        // Tab is hidden when these conditions don't match.
        showWhen: [
          { field: "enabled", value: true },
          { field: "isSellingItems", value: true },
        ],
        children: [
          // Anything renderable in `gameStateTab`. Reuse template
          // components like `text-block`, `heading`, `button`,
          // `game-attribute`, etc.
          {
            id: "shop-coin-balance",
            type: "game-attribute",
            area: "gameStateTab",
            attribute: "coin",
            label: "Your balance",
            icon: "coins",
          },
          {
            id: "shop-skip-token-stock",
            type: "text-block",
            area: "gameStateTab",
            content: "{{skipTokenStock}} in stock",
          },
          {
            id: "shop-buy-skip-token",
            type: "button",
            area: "gameStateTab",
            label: "Buy ({{config.skipTokenPrice}} coins)",
            action: "buySkipToken",
          },
        ],
      },
    ],
    storeKeys: ["skipTokenStock"],
  }
}
```

Tabs render in **registration order**; the built-in **Inventory** tab is always first.

### `game-attribute` and `UserGameStateContext`

Plugin tab content is rendered inside a `UserGameStateContext`, which exposes the current user's attributes, inventory, and active session. The `game-attribute` template component reads from this context, so `{ type: "game-attribute", attribute: "coin" }` displays the user's live coin balance without any additional wiring.

If you need to read game state from custom React components, import the hook:

```tsx
import { useUserGameState } from "@/components/Modals/UserGameStateContext"

function MyTabContent() {
  const gs = useUserGameState()
  if (!gs) return null
  return <span>{gs.getAttribute("coin")} coins</span>
}
```

The context is `null` outside the game state modal, so components can render meaningful fallbacks when used elsewhere.

For **Item Shops**–style sell previews, the same payload includes **`currentShopInstance`** (`ShoppingSessionInstance` from `GET_MY_GAME_STATE` when a shopping round is active and the user has a visit). Persisted fields **`listedShortIds`**, optional **`listedPriceOverrides`**, and **`listedBuybackRate` / `unlistedBuybackRate`** match server sell-back math so the web client can quote refunds (e.g. `quoteItemShopsSellCoins` in `apps/web/src/lib/itemShopsSellQuote.ts`) without bundling the full shop catalog.

### Inventory actions

The built-in Inventory tab exposes per-item buttons:

- **Use** – emitted as `USE_INVENTORY_ITEM { itemId, targetUserId? }`. Optional **`targetUserId`** is sent when the item’s definition has **`requiresTarget: "user"`** (target picker in the inventory tab). Passed through as **`callContext`** to `onItemUsed`. See [ADR 0045](../adrs/0045-inventory-item-targeting.md).
- **Sell** – emitted as `SELL_INVENTORY_ITEM { itemId }`. Routes to the source plugin's `onItemSold` (typically `ShopHelper.sell`).

The buttons render automatically based on the `ItemDefinition` flags: **Use** appears for `consumable` items, **Sell** appears for `tradeable` items with a positive `coinValue`. For **item-shops** items, the built-in tab only shows **Sell** while **`currentShopInstance`** is present (a shop visit is open); the button label can include the quoted coin refund using instance listing fields above. The server responds with `INVENTORY_ACTION_RESULT { success, message, refund? }`.

---
