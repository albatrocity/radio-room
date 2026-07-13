# Data & Export

## Data Augmentation

Add plugin-specific metadata to playlist items and now playing tracks.

### Playlist Augmentation

```typescript
async augmentPlaylistBatch(items: QueueItem[]): Promise<PluginAugmentationData[]> {
  if (!this.context || items.length === 0) {
    return items.map(() => ({}))
  }

  // Batch fetch for efficiency
  const trackIds = items.map(item => item.mediaSource.trackId)
  const skipKeys = trackIds.map(id => `skipped:${id}`)
  const skipDataStrings = await this.context.storage.mget(skipKeys)

  return skipDataStrings.map(dataStr => {
    if (!dataStr) return {}
    try {
      const skipData = JSON.parse(dataStr)
      return { skipped: true, skipData }
    } catch {
      return {}
    }
  })
}
```

### Now Playing Augmentation

```typescript
async augmentNowPlaying(item: QueueItem): Promise<PluginAugmentationData> {
  if (!this.context) return {}

  const config = await this.getConfig()
  if (!config?.enabled) return {}

  const skipData = await this.context.storage.get(`skipped:${item.mediaSource.trackId}`)
  if (!skipData) return {}

  return {
    skipped: true,
    skipData: JSON.parse(skipData),
    // Style hints for the now playing UI
    styles: {
      title: {
        textDecoration: "line-through",
        opacity: 0.7,
      },
    },
  }
}
```

### `PluginAugmentationData` shape

Augmentation methods return `PluginAugmentationData`, merged into `QueueItem.pluginData[pluginName]` on the client. Common fields:

| Field | Description |
| ----- | ----------- |
| `elementProps` | Per-element now playing hints keyed by `title`, `artist`, `album`, or `artwork` (`PluginElementProps`: `obscured`, `placeholder`, `revealedBy`, `obscureBypassRoles`). See [ADR 0039](../adrs/0039-plugin-element-properties-for-now-playing.md). |
| `userReveals` | Per-user reveal overrides for **inclusive** participation modes ([ADR 0062](../adrs/0062-participation-mode-pvp-vs-pvg.md)): map of `userId` → partial `title` / `artist` / `album` → `revealedBy`. Broadcast to all clients; the web client applies **only the current viewer’s row** when resolving `elementProps` (`usePluginElementProps` / `resolvePluginElementProps`). Plugins SHOULD cap payload size (e.g. 200 most recent users). Room-level `elementProps` may stay obscured while `userReveals` carries per-viewer overrides. |
| `styles` | Legacy inline style hints for now playing text (prefer `elementProps` for new work). |
| Other keys | Plugin-specific data (e.g. `skipped`, leaderboard hints). |

Example with obscured fields and per-user reveals (Guess the Tune inclusive mode):

```typescript
async augmentNowPlaying(item: QueueItem): Promise<PluginAugmentationData> {
  // ... load round state ...

  return {
    elementProps: {
      title: { obscured: true, placeholder: "???" },
      artist: { obscured: true, placeholder: "???" },
      album: { obscured: true, placeholder: "???" },
      artwork: { obscured: true },
    },
    userReveals: {
      "user-a": {
        title: { userId: "user-a", username: "Alice", at: Date.now(), source: "chat" },
      },
      "user-b": {
        artist: { userId: "user-b", username: "Bob", at: Date.now(), source: "chat" },
        album: { userId: "user-b", username: "Bob", at: Date.now(), source: "chat" },
      },
    },
  }
}
```

Admin-only plugin actions that mutate room state SHOULD verify `await this.context.api.isRoomAdmin(roomId, initiator.userId)` server-side even when the UI uses `adminOnly: true` on buttons ([ADR 0062](../adrs/0062-participation-mode-pvp-vs-pvg.md)).


## Room Export

Plugins can contribute to room exports in two ways:

1. **Add export data and markdown sections** via `augmentRoomExport()`
2. **Format per-item plugin data** via `formatPluginDataMarkdown()`

Note: Data from `augmentPlaylistBatch` and `augmentNowPlaying` is automatically included in exports via `item.pluginData`.

### Export Augmentation

Add summary data and/or additional markdown sections to exports:

```typescript
import type { RoomExportData, PluginExportAugmentation } from "@repo/types"

async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
  // Count tracks that were skipped by this plugin
  const skippedTracks = exportData.playlist.filter(
    item => item.pluginData?.["playlist-democracy"]?.skipped
  )

  // Calculate stats
  const totalSkipped = skippedTracks.length
  const totalVotes = skippedTracks.reduce(
    (sum, item) => sum + (item.pluginData?.["playlist-democracy"]?.skipData?.voteCount || 0),
    0
  )

  return {
    // Data added to export.pluginExports["playlist-democracy"]
    data: {
      totalSkipped,
      totalVotes,
      averageVotesPerSkip: totalSkipped > 0 ? totalVotes / totalSkipped : 0,
    },

    // Additional markdown sections appended to export
    markdownSections: [
      `## Playlist Democracy Stats\n\n` +
      `- **Tracks Skipped:** ${totalSkipped}\n` +
      `- **Total Votes Cast:** ${totalVotes}\n` +
      `- **Average Votes per Skip:** ${(totalVotes / totalSkipped).toFixed(1)}`,
    ],
  }
}
```

### Per-Item Markdown Formatting

Format your plugin's augmented data as markdown for playlist items, chat messages, etc.:

```typescript
import type { PluginMarkdownContext } from "@repo/types"

formatPluginDataMarkdown(
  pluginData: unknown,
  context: PluginMarkdownContext
): string | null {
  // Only format for playlist items
  if (context.type !== "playlist") return null

  const data = pluginData as { skipped?: boolean; skipData?: { voteCount: number; requiredCount: number } }

  if (!data.skipped || !data.skipData) return null

  const { voteCount, requiredCount } = data.skipData
  return `⏭️ Skipped (${voteCount}/${requiredCount} votes)`
}
```

This method is called for each item that has your plugin's data in `pluginData`. The returned string appears in the "Notes" column of playlist tables in markdown exports.

### Context Types

The `context.type` parameter indicates what kind of item is being formatted:

| Type         | Description                 |
| ------------ | --------------------------- |
| `playlist`   | Historical playlist item    |
| `chat`       | Chat message                |
| `queue`      | Track in the upcoming queue |
| `nowPlaying` | Currently playing track     |

### Export Data Structure

The `RoomExportData` passed to `augmentRoomExport` contains:

```typescript
interface RoomExportData {
  exportedAt: string // ISO timestamp
  room: RoomExportInfo // Room metadata
  users: User[] // Current users
  playlist: QueueItem[] // With pluginData from augmentation
  chat: ChatMessage[] // Chat history
  queue: QueueItem[] // Upcoming tracks
  reactions: ReactionStore // All reactions by type/id
  pluginExports?: Record<string, unknown> // Plugin data added here
}
```

### Example: Complete Export Implementation

```typescript
import type { RoomExportData, PluginExportAugmentation, PluginMarkdownContext } from "@repo/types"

export class MyPlugin extends BasePlugin<MyConfig> {
  // ... other methods ...

  async augmentRoomExport(exportData: RoomExportData): Promise<PluginExportAugmentation> {
    const config = await this.getConfig()

    // Get plugin-specific stats
    const stats = await this.calculateExportStats(exportData)

    return {
      data: {
        enabled: config?.enabled ?? false,
        ...stats,
      },
      markdownSections: config?.enabled ? [this.generateMarkdownSection(stats)] : [],
    }
  }

  formatPluginDataMarkdown(pluginData: unknown, context: PluginMarkdownContext): string | null {
    const data = pluginData as MyPluginData | undefined
    if (!data) return null

    switch (context.type) {
      case "playlist":
        return data.highlighted ? "⭐ Featured" : null
      case "chat":
        return data.specialWord ? `🎯 ${data.specialWord}` : null
      default:
        return null
    }
  }

  private async calculateExportStats(exportData: RoomExportData) {
    // Analyze export data for plugin-specific metrics
    return {
      itemsProcessed: exportData.playlist.length,
      // ... more stats
    }
  }

  private generateMarkdownSection(stats: any): string {
    return `## My Plugin Summary\n\n- Items processed: ${stats.itemsProcessed}`
  }
}
```
