# Admin Configuration

## Configuration Schema

Define a schema to generate dynamic admin settings forms.

### Basic Schema

```typescript
getConfigSchema(): PluginConfigSchema {
  return {
    // JSON Schema from Zod
    jsonSchema: z.toJSONSchema(myConfigSchema),

    // Field order and layout elements
    layout: [
      { type: "heading", content: "My Plugin Settings" },
      {
        type: "text-block",
        content: "Configure your plugin settings below.",
        variant: "info",
      },
      "enabled",
      "threshold",
      "message",
    ],

    // Field-specific metadata
    fieldMeta: {
      enabled: {
        type: "boolean",
        label: "Enable Plugin",
        description: "Turn the plugin on or off",
      },
      threshold: {
        type: "number",
        label: "Threshold Value",
        showWhen: { field: "enabled", value: true },
      },
    },
  }
}
```

### Field Types

| Type         | Description      | Options                          |
| ------------ | ---------------- | -------------------------------- |
| `boolean`    | Toggle switch    | -                                |
| `string`     | Text input       | -                                |
| `number`     | Numeric input    | -                                |
| `enum`       | Dropdown select  | `enumLabels: { value: "Label" }` |
| `emoji`      | Emoji picker     | -                                |
| `duration`   | Time duration    | `displayUnit`, `storageUnit`     |
| `percentage` | Percentage input | -                                |

### Conditional Fields

Show/hide fields based on other values:

```typescript
fieldMeta: {
  threshold: {
    type: "number",
    label: "Threshold",
    showWhen: { field: "enabled", value: true },
  },
  // Multiple conditions (AND logic)
  advancedSetting: {
    type: "string",
    showWhen: [
      { field: "enabled", value: true },
      { field: "advancedMode", value: true },
    ],
  },
}
```

### Layout Elements

```typescript
layout: [
  // Heading
  { type: "heading", content: "Section Title" },

  // Text block with variant
  {
    type: "text-block",
    content: "Informational text here.",
    variant: "info", // "info" | "warning" | "example"
    showWhen: { field: "enabled", value: true },
  },

  // Text with template interpolation
  {
    type: "text-block",
    content: "Threshold is set to {{threshold:percentage}}.",
    variant: "example",
  },

  // Rich content with embedded components
  {
    type: "text-block",
    content: [
      { type: "text", content: "React with " },
      { type: "component", name: "emoji", props: { shortcodes: ":{{reactionType}}:" } },
      { type: "text", content: " to vote!" },
    ],
  },

  // Field reference (string = field name)
  "myFieldName",

  // Action button (see [Plugin Actions](#plugin-actions))
  {
    type: "action",
    action: "resetData",
    label: "Reset Data",
    variant: "destructive",
    confirmMessage: "Are you sure? This cannot be undone.",
    confirmText: "Reset",
  },
]
```

### Duration Fields

```typescript
fieldMeta: {
  timeLimit: {
    type: "duration",
    label: "Time Limit",
    description: "How long to wait (10-300 seconds)",
    displayUnit: "seconds",   // Show as seconds in UI
    storageUnit: "milliseconds", // Store as milliseconds
    showWhen: { field: "enabled", value: true },
  },
}
```


## Plugin Actions

Add action buttons to your plugin's config form to trigger server-side operations like resetting data, syncing state, or performing maintenance tasks.

### Defining Action Buttons

Add action elements to your config schema's `layout` array:

```typescript
getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(myConfigSchema),
    layout: [
      "enabled",
      "threshold",
      // Action button at the end of the form
      {
        type: "action",
        action: "resetLeaderboards",      // Unique action identifier
        label: "Reset Leaderboards",      // Button text
        variant: "destructive",           // "solid" | "outline" | "ghost" | "destructive"
        confirmMessage: "Are you sure you want to reset all leaderboards? This cannot be undone.",
        confirmText: "Reset Leaderboards", // Confirmation button text
        showWhen: { field: "enabled", value: true }, // Optional conditional visibility
      },
    ],
    fieldMeta: { /* ... */ },
  }
}
```

### Action Element Properties

| Property         | Type     | Required | Description                                                                                     |
| ---------------- | -------- | -------- | ----------------------------------------------------------------------------------------------- |
| `type`           | `string` | Yes      | Must be `"action"`                                                                              |
| `action`         | `string` | Yes      | Unique identifier passed to `executeAction()`                                                   |
| `label`          | `string` | Yes      | Button label text                                                                               |
| `variant`        | `string` | No       | Button style: `"solid"`, `"outline"`, `"ghost"`, `"destructive"`                                |
| `confirmMessage` | `string` | No       | If provided, shows confirmation dialog before executing                                         |
| `confirmText`    | `string` | No       | Text for the confirmation button (default: "Confirm")                                           |
| `showWhen`       | `object` | No       | Conditional visibility (same as field `showWhen`)                                               |
| `formFields`     | `array`  | No       | Optional fields shown in a popover before run; values are passed as `params` to `executeAction` |

### Quick Access Panels

Opt run-of-show actions into the room **Quick Access** menu (admin-only FloatingPanels) by listing their action names on the schema (see [ADR 0072](../adrs/0072-quick-access-admin-panels.md)):

```typescript
getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(myConfigSchema),
    layout: [
      "enabled",
      {
        type: "action",
        action: "startSession",
        label: "Start session",
        showWhen: { field: "enabled", value: true },
      },
      {
        type: "action",
        action: "endSession",
        label: "End session",
        showWhen: { field: "enabled", value: true },
      },
    ],
    fieldMeta: { /* ... */ },
    // Action names from layout — order is panel order
    quickAccess: ["startSession", "endSession"],
  }
}
```

The menu only lists plugins that declare `quickAccess` **and** have `enabled: true` in room config. Panels are actions-only (no config field editing). Which panels are open persists in sessionStorage per room; desktop position/size is ephemeral.

### Handling Actions

Override the `executeAction` method to handle action button clicks. When `formFields` are defined, the admin UI collects values and sends them as the third argument (`params`):

```typescript
async executeAction(
  action: string,
  initiator?: PluginActionInitiator,
  params?: Record<string, unknown>,
): Promise<{ success: boolean; message?: string }> {
  switch (action) {
    case "resetLeaderboards":
      return this.resetLeaderboards()
    case "syncData":
      return this.syncData()
    default:
      return { success: false, message: `Unknown action: ${action}` }
  }
}
```

Simple actions without forms omit `params`. Form field types are `select` (static `options`), `user-select` (same `options` prepended before live room users), and `string`.

```typescript
private async resetLeaderboards(): Promise<{ success: boolean; message?: string }> {
  if (!this.context) {
    return { success: false, message: "Plugin not initialized" }
  }

  try {
    // Clear leaderboard data from storage
    const leaderboard = await this.context.storage.zrangeWithScores("leaderboard", 0, -1)
    for (const entry of leaderboard) {
      await this.context.storage.zrem("leaderboard", entry.value)
    }

    // IMPORTANT: Emit event with updated store keys to refresh frontend
    await this.emit("LEADERBOARDS_RESET", {
      usersLeaderboard: [],      // Include store keys in event data
      allWordsLeaderboard: [],   // Frontend will update its store
    })

    return { success: true, message: "Leaderboards have been reset" }
  } catch (error) {
    return { success: false, message: `Error: ${error}` }
  }
}
```

### Updating Frontend After Actions

When an action modifies data that's displayed in plugin components, you must emit an event containing the updated store keys. The frontend's `pluginComponentMachine` listens for `PLUGIN:{pluginName}:*` events and updates its store when event data contains any of the plugin's `storeKeys`.

```typescript
// Component schema defines which keys to watch
getComponentSchema(): PluginComponentSchema {
  return {
    components: [ /* ... */ ],
    storeKeys: ["usersLeaderboard", "allWordsLeaderboard"], // Keys that trigger updates
  }
}

// Event must include the store keys for frontend to update
await this.emit("DATA_RESET", {
  usersLeaderboard: [],      // ✓ Frontend will update
  allWordsLeaderboard: [],   // ✓ Frontend will update
})

// This won't update the frontend (no store keys in payload)
await this.emit("DATA_RESET", {})  // ✗ Frontend won't know to update
```

### Event Flow

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Admin clicks "Reset Leaderboards" button                                │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Frontend emits EXECUTE_PLUGIN_ACTION via Socket.IO                      │
│   { pluginName: "special-words", action: "resetLeaderboards" }          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Server: PluginRegistry.executePluginAction() calls plugin.executeAction │
│   (optional second arg: initiator { userId, username } from admin socket) │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Plugin: executeAction("resetLeaderboards")                              │
│   1. Clear data from storage                                            │
│   2. Emit event with new store values                                   │
│   3. Return { success: true, message: "..." }                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│ Frontend receives:                                                       │
│   1. PLUGIN_ACTION_RESULT → Shows success/error toast                   │
│   2. PLUGIN:special-words:LEADERBOARDS_RESET → Updates component store  │
└─────────────────────────────────────────────────────────────────────────┘
```

### Complete Example

```typescript
// schema.ts
export function getConfigSchema(): PluginConfigSchema {
  return {
    jsonSchema: z.toJSONSchema(myConfigSchema),
    layout: [
      { type: "heading", content: "My Plugin" },
      "enabled",
      "words",
      "showLeaderboard",
      // Destructive action with confirmation
      {
        type: "action",
        action: "resetLeaderboards",
        label: "Reset Leaderboards",
        variant: "destructive",
        confirmMessage: "Are you sure? All scores will be lost.",
        confirmText: "Reset",
        showWhen: { field: "enabled", value: true },
      },
      // Simple action without confirmation
      {
        type: "action",
        action: "syncNow",
        label: "Sync Now",
        variant: "outline",
        showWhen: { field: "enabled", value: true },
      },
    ],
    fieldMeta: {
      /* ... */
    },
  }
}
```

```typescript
// index.ts
async executeAction(action: string): Promise<{ success: boolean; message?: string }> {
  switch (action) {
    case "resetLeaderboards":
      return this.resetLeaderboards()
    case "syncNow":
      return this.syncNow()
    default:
      return { success: false, message: `Unknown action: ${action}` }
  }
}

private async resetLeaderboards(): Promise<{ success: boolean; message?: string }> {
  // ... clear data ...

  // Update frontend components
  await this.emit("LEADERBOARDS_RESET", {
    usersLeaderboard: [],
    allWordsLeaderboard: [],
  })

  return { success: true, message: "Leaderboards reset successfully" }
}

private async syncNow(): Promise<{ success: boolean; message?: string }> {
  // ... perform sync ...
  return { success: true, message: "Sync completed" }
}
```
