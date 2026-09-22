import type {
  PluginAPI,
  PluginAugmentationData,
  PluginStorage,
  QueueItem,
} from "@repo/types"

/** Redis key for per-track skip metadata written by skip-capable plugins. */
export function skipStorageKey(trackId: string): string {
  return `skipped:${trackId}`
}

/** Parse JSON skip metadata from storage; returns null on missing/invalid data. */
export function parseSkipData<T = Record<string, unknown>>(dataStr: string | null): T | null {
  if (!dataStr) return null
  try {
    return JSON.parse(dataStr) as T
  } catch {
    return null
  }
}

export type TrackAnnotationsOptions = {
  storage: Pick<PluginStorage, "set" | "get" | "mget">
  api: Pick<PluginAPI, "getNowPlaying" | "updatePlaylistTrack">
  roomId: string
  pluginName: string
}

/**
 * Persist and read skipped-track annotations for playlist/now-playing augmentation.
 *
 * Call {@link TrackAnnotations.markSkipped} before `api.skipTrack` so
 * `getNowPlaying` still resolves to the track being annotated.
 */
export class TrackAnnotations {
  constructor(private readonly opts: TrackAnnotationsOptions) {}

  /**
   * Store skip metadata under `skipped:{trackId}` and stamp the current
   * now-playing track's `pluginData` for room export.
   */
  async markSkipped(trackId: string, meta: Record<string, unknown>): Promise<void> {
    const { storage, api, roomId, pluginName } = this.opts
    await storage.set(skipStorageKey(trackId), JSON.stringify(meta))

    const nowPlaying = await api.getNowPlaying(roomId)
    if (!nowPlaying) return

    const existingPluginData = nowPlaying.pluginData ?? {}
    await api.updatePlaylistTrack(roomId, {
      ...nowPlaying,
      pluginData: {
        ...existingPluginData,
        [pluginName]: { skipped: true, skipData: meta },
      },
    })
  }

  /**
   * Batch-load skip annotations for playlist/queue items (same order as `items`).
   */
  async enrichQueueItems(items: QueueItem[]): Promise<PluginAugmentationData[]> {
    if (items.length === 0) return []

    const { storage } = this.opts
    const keys = items.map((item) => skipStorageKey(item.mediaSource.trackId))
    const values = await storage.mget(keys)

    return values.map((dataStr) => {
      const skipData = parseSkipData(dataStr)
      return skipData ? { skipped: true, skipData } : {}
    })
  }
}
