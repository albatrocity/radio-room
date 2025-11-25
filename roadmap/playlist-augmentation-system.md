# Playlist Data Augmentation System

## Overview

Add opt-in playlist augmentation capability to the plugin system, allowing plugins to enrich playlist items with metadata at read-time. Implement this for the Playlist Democracy plugin to display skipped tracks with strikethrough styling.

## Backend Changes

### 1. Update Plugin Types (`packages/types/Plugin.ts`)

- Add optional `augmentPlaylistBatch?(items: QueueItem[]): Promise<Record<string, any>[]>` method to `Plugin` interface
- Add `pluginData?: Record<string, any>` to `QueueItem` type for augmented data

### 2. Update PluginRegistry (`packages/server/lib/plugins/PluginRegistry.ts`)

- Track which plugins implement `augmentPlaylistBatch` during registration
- Add `augmentPlaylistItems(roomId: string, items: QueueItem[]): Promise<QueueItem[]>` method
- Only call plugins that registered augmentation capability
- Execute all augmentations in parallel with `Promise.all()`
- Merge results into `pluginData` field on each item

### 3. Update PluginStorage (`packages/server/lib/plugins/PluginStorage.ts`)

- Add `mget(keys: string[]): Promise<(string | null)[]>` method for batch reads
- Use Redis pipelining for efficient bulk operations

### 4. Update BasePlugin (`packages/plugin-base/index.ts`)

- Add optional `augmentPlaylistBatch` stub/helper method for subclasses

### 5. Update Playlist Democracy Plugin (`packages/plugin-playlist-democracy/index.ts`)

- Implement `augmentPlaylistBatch(items: QueueItem[]): Promise<Record<string, any>[]>`
- Extract all trackIds from items
- Batch fetch skip data using `storage.mget()`
- Return array of skip metadata objects (or empty objects for non-skipped tracks)

### 6. Update Playlist Operations (`packages/server/operations/data/playlists.ts`)

- Modify `getRoomPlaylist()` to call `pluginRegistry.augmentPlaylistItems()` before returning
- Modify `getRoomPlaylistSince()` to call `pluginRegistry.augmentPlaylistItems()` before returning

### 7. Update Room Handlers (`packages/server/handlers/roomHandlers.ts`)

- Update `getLatestRoomData()` to ensure playlist is augmented before emitting `ROOM_DATA` event

### 8. Update PubSub Handlers (`packages/server/pubSub/handlers/jukebox.ts`)

- Update `handlePlaylistAdded()` to augment single track before emitting `PLAYLIST_TRACK_ADDED`

## Frontend Changes

### 9. Update Types (`apps/web/src/types/Queue.ts`)

- Add `pluginData?: Record<string, any>` to `QueueItem` type (matching backend)

### 10. Update PlaylistItem Component (`apps/web/src/components/PlaylistItem.tsx`)

- Check for `item.pluginData?.['playlist-democracy']?.skipped`
- Apply `textDecoration: "line-through"` styling to track title/artist when skipped
- Optionally add visual indicator (e.g., "⏭️" icon)

### 11. Update SelectablePlaylistItem (`apps/web/src/components/SelectablePlaylistItem.tsx`)

- Pass through plugin data to underlying `PlaylistItem` component
- Ensure styling cascades correctly

## Testing

### 12. Add Tests for PluginStorage.mget()

- Test batch retrieval with multiple keys
- Test handling of missing keys (null values)
- Verify pipelining is used

### 13. Add Tests for PluginRegistry Augmentation

- Test opt-in registration detection
- Test parallel augmentation with multiple plugins
- Test augmentation with no registered plugins
- Test data merging into pluginData field

### 14. Update Playlist Democracy Plugin Tests

- Add tests for `augmentPlaylistBatch()`
- Verify batch retrieval of skip data
- Test with mix of skipped and non-skipped tracks

### 15. Manual Frontend Testing

- Verify skipped tracks display with strikethrough
- Test with playlist of 100+ items for performance
- Verify non-skipped tracks remain unaffected
