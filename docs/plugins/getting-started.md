# Getting Started

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     Plugin Registry                         │
│              (Creates instance per room)                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            ├─ Creates PluginContext
                            │   ├─ api: PluginAPI
                            │   ├─ storage: PluginStorage
                            │   ├─ game: GameSessionPluginAPI (room-scoped)
                            │   ├─ inventory: InventoryPluginAPI (room-scoped)
                            │   ├─ personas: PersonasPluginAPI (room-scoped)
                            │   ├─ lifecycle: Event handlers
                            │   └─ roomId: string
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Your Plugin                             │
│               extends BasePlugin<TConfig>                   │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Config      │  │ Components   │  │ Event Handlers    │  │
│  │ Schema      │  │ Schema       │  │ & Business Logic  │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
│                                                             │
│  ┌────────────────── Composable Helpers ──────────────────┐│
│  │ ShopHelper / ShopPlugin · (future: RoundsHelper, …)   ││
│  └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      Frontend                               │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Dynamic     │  │ Plugin       │  │ Socket Event      │  │
│  │ Settings    │  │ Components   │  │ Updates           │  │
│  │ Forms       │  │ (Declarative)│  │                   │  │
│  └─────────────┘  └──────────────┘  └───────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

1. **One Instance Per Room**: Each room gets its own plugin instance with isolated state
2. **Event-Driven**: Plugins react to system events (TRACK_CHANGED, REACTION_ADDED, etc.)
3. **Declarative UI**: Define UI components via JSON schema - no React code in plugins
4. **Type-Safe**: Full TypeScript support with Zod schema validation
5. **Sandboxed Storage**: Redis storage namespaced by plugin and room
6. **Optional Global Game State**: Core services expose `context.game` (sessions, score/coin, modifiers, leaderboards) and `context.inventory` (cross-plugin items). Use these when you want shared economy or UI across plugins; keep plugin-local sorted sets when scores should stay private to one plugin.
7. **User Personas**: Core `context.personas` exposes session identity labels (VIP, Judge, etc.) with badges in the listener list and chat. See [User Personas](user-personas.md#user-personas) and [ADR 0057](../adrs/0057-user-personas-system.md).


## Quick Start

### 1. Create Plugin Package

```bash
mkdir packages/plugin-my-feature
cd packages/plugin-my-feature
```

### 2. Package Configuration

```json
{
  "name": "@repo/plugin-my-feature",
  "version": "1.0.0",
  "main": "index.ts",
  "dependencies": {
    "@repo/types": "*",
    "@repo/plugin-base": "*",
    "zod": "^4.0.0"
  }
}
```

### 3. Define Types

```typescript
// types.ts
import { z } from "zod"

export const myFeatureConfigSchema = z.object({
  enabled: z.boolean().default(false),
  threshold: z.number().min(1).max(100).default(50),
  message: z.string().default("Hello!"),
})

export type MyFeatureConfig = z.infer<typeof myFeatureConfigSchema>

export const defaultMyFeatureConfig: MyFeatureConfig = {
  enabled: false,
  threshold: 50,
  message: "Hello!",
}
```

### 4. Implement Plugin

```typescript
// index.ts
import { z } from "zod"
import { BasePlugin } from "@repo/plugin-base"
import type { Plugin, PluginContext, PluginConfigSchema, QueueItem } from "@repo/types"
import packageJson from "./package.json"
import { myFeatureConfigSchema, defaultMyFeatureConfig, type MyFeatureConfig } from "./types"

export class MyFeaturePlugin extends BasePlugin<MyFeatureConfig> {
  name = "my-feature"
  version = packageJson.version
  description = "A sample plugin"

  // Static schema and defaults
  static readonly configSchema = myFeatureConfigSchema
  static readonly defaultConfig = defaultMyFeatureConfig

  async register(context: PluginContext): Promise<void> {
    await super.register(context)

    // Register event handlers using typed helper
    this.on("TRACK_CHANGED", this.onTrackChanged.bind(this))
    this.on("REACTION_ADDED", this.onReactionAdded.bind(this))

    // Register filtered config change handler
    this.onConfigChange(this.handleConfigChange.bind(this))
  }

  private async onTrackChanged(data: { roomId: string; track: QueueItem }): Promise<void> {
    const config = await this.getConfig()
    if (!config?.enabled) return

    console.log(`[${this.name}] Track changed: ${data.track.title}`)
  }

  private async onReactionAdded(data: { roomId: string; reaction: any }): Promise<void> {
    // Handle reaction
  }

  private async handleConfigChange(data: {
    roomId: string
    config: Record<string, unknown>
    previousConfig: Record<string, unknown>
  }): Promise<void> {
    const config = data.config as MyFeatureConfig
    const previousConfig = data.previousConfig as MyFeatureConfig | null

    if (!previousConfig?.enabled && config?.enabled) {
      await this.context!.api.sendSystemMessage(this.context!.roomId, "✨ My Feature enabled!")
    }
  }

  // Optional: Define admin settings form
  getConfigSchema(): PluginConfigSchema {
    return {
      jsonSchema: z.toJSONSchema(myFeatureConfigSchema),
      layout: ["enabled", "threshold", "message"],
      fieldMeta: {
        enabled: {
          type: "boolean",
          label: "Enable Feature",
        },
        threshold: {
          type: "number",
          label: "Threshold",
          description: "Value between 1-100",
        },
        message: {
          type: "string",
          label: "Custom Message",
        },
      },
    }
  }
}

// Factory function
export function createMyFeaturePlugin(configOverrides?: Partial<MyFeatureConfig>): Plugin {
  return new MyFeaturePlugin(configOverrides)
}

export default createMyFeaturePlugin
```

### 5. Register Plugin

In `apps/api/src/server.ts`:

```typescript
import { createMyFeaturePlugin } from "@repo/plugin-my-feature"

// In registerAdapters():
await registerAdapters(context, {
  plugins: [
    createPlaylistDemocracyPlugin,
    createSpecialWordsPlugin,
    createMyFeaturePlugin, // Add your plugin
  ],
})
```

Also add the package to `apps/api/package.json` and run `npm install`.

### 6. Register the admin settings view

**Do this every time you add a plugin.** `AdminSettingsSurface` / Overview list plugins from `getConfigSchema()`, and clicks send `toPluginSettingsEventType(pluginName)` (e.g. `my-feature` → `EDIT_MY_FEATURE`). That event is a no-op until `modalsMachine` knows it.

In `apps/web/src/machines/modalsMachine.ts`, for plugin name `my-feature` (hyphens become underscores / scream case):

1. Add `{ type: "EDIT_MY_FEATURE" }` to the `Event` union.
2. Add `EDIT_MY_FEATURE: ".my_feature"` to `settingsSectionOn`.
3. Add `EDIT_MY_FEATURE: openSettingsSection("my_feature")` on the `modal` region's `on`.
4. Add `my_feature: { on: { BACK: "overview" } }` under `settings.states`.

Copy an existing plugin row (e.g. `queue_theme` or `the_fed`) and add a `modalsMachine.test.ts` case that opens the section and `BACK`s to overview.

Without this step, the Plugins list in Admin Settings shows the name but the button does not open the form.
