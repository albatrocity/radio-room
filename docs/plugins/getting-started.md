# Getting Started

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                     Plugin Registry                         │
│              (one instance per room)                        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ├─ Creates PluginContext
                            │   ├─ api: PluginAPI (chat, presence, effects, config, emit)
                            │   ├─ storage: PluginStorage
                            │   ├─ game: GameSessionPluginAPI (room-scoped)
                            │   ├─ inventory: InventoryPluginAPI (room-scoped)
                            │   ├─ artifacts: ArtifactsPluginAPI (cross-room)
                            │   ├─ personas: PersonasPluginAPI (room-scoped)
                            │   ├─ polls: PollsPluginAPI
                            │   ├─ schedule: SchedulePluginAPI
                            │   ├─ queue: QueuePluginAPI
                            │   ├─ playback: PlaybackPluginAPI
                            │   ├─ catalog: CatalogPluginAPI
                            │   ├─ lifecycle: Event handlers
                            │   ├─ getRoom / appContext
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
│  │ ShopHelper / ShopPlugin                                ││
│  │ createLeaderboard from @repo/plugin-base               ││
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
8. **Capability fields**: Polls, schedules, the queue, playback, and the catalog are `context.polls`, `context.schedule`, `context.queue`, `context.playback`, and `context.catalog` ([ADR 0201](../adrs/0201-plugin-capability-interfaces.md)). `context.api` is the residual host (chat, presence, effects, config, `emit`). `this.schedule()` / `this.cancelSchedule()` on `BasePlugin` call `context.schedule`.


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
  "type": "module",
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

`"type": "module"` matters: studio-bridge loads every plugin with Node's ESM loader, which cannot read named exports from a CommonJS-typed package.

### 5. Register Plugin

Add the factory to `pluginFactories` in `packages/plugins/index.ts` and the package to `packages/plugins/package.json`, then run `npm install`:

```typescript
import createMyFeaturePlugin from "@repo/plugin-my-feature"

export const pluginFactories: PluginFactory[] = [
  createPlaylistDemocracyPlugin,
  // …
  createMyFeaturePlugin,
]
```

That is the whole registration. The API passes `pluginFactories` to `registerAdapters`, and studio-bridge serves their schemas to Game Studio ([ADR 0202](../adrs/0202-plugin-registry-package-and-generic-settings-state.md)). Admin Settings lists every plugin with a `getConfigSchema()`, and its link sends `EDIT_PLUGIN_SETTINGS` with the plugin name to the shared `settings.plugin` state in `modalsMachine`. No per-plugin web code is needed.

### 6. When a plugin needs a host change

A plugin that uses existing component templates and existing `PluginContext` methods stops at step 5. These three cases still change host code:

| Change | Files |
| ------ | ----- |
| New component template type | `packages/types/PluginComponent.ts`, the template React component, `apps/web/src/components/PluginComponents/templates/componentMap.tsx` ([Plugin Components](components.md)) |
| New host capability | A new `PluginContext` field and `Plugin*API` interface, plus an ADR, following [ADR 0201](../adrs/0201-plugin-capability-interfaces.md). Do not add methods to the residual `PluginAPI` |
| Plugin event handled by core UI | That machine's `subscribeById` `eventTypes` ([ADR 0093](../adrs/0093-client-socket-event-allowlists-and-shared-plugin-component-actors.md)), as `GameSessions.tsx` does for `PLUGIN:the-fed:TICK`. Plugin component areas already receive `PLUGIN:{name}:*` |

If the plugin's Room UI depends on an action Game Studio should simulate, add a stub to `apps/studio-bridge` (see `stubQuiz.ts`, `stubLyricHero.ts`). Schemas need no studio change.
