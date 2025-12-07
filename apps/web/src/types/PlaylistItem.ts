import { QueueItem, getPreferredTrack } from "./Queue"

// Re-export QueueItem as PlaylistItem for backward compatibility
// The server now sends QueueItem format, so we use it directly
export type PlaylistItem = QueueItem

// Re-export helper function
export { getPreferredTrack }
