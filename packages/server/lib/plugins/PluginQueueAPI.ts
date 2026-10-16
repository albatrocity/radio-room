import { randomUUID } from "crypto"
import type { MoveTrackResult, QueueItem, QueueItemAttribution, QueuePluginAPI } from "@repo/types"
import { isDeferredQueueRequest } from "@repo/types"
import { QueueMutationDuringEmitError } from "./QueueMutationDuringEmitError"
import { PluginCapability } from "./PluginCapability"

/** Scoped queue reads and writes for one plugin (ADR 0201). */
export class PluginQueueAPI extends PluginCapability implements QueuePluginAPI {
  private deferredSkips: { roomId: string; trackId: string }[] | null = null
  private deferredSkipTimer: ReturnType<typeof setTimeout> | null = null

  async getNowPlaying(roomId: string): Promise<QueueItem | null> {
    const { getRoomCurrent } = await import("../../operations/data")
    const current = await getRoomCurrent({ context: this.context, roomId })
    return current?.nowPlaying ?? null
  }

  async skipTrack(roomId: string, trackId: string): Promise<void> {
    if (this.context.systemEvents?.isEmittingToPlugins?.(roomId)) {
      this.scheduleSkip(roomId, trackId)
      return
    }
    await this.runSkip(roomId, trackId)
  }

  /** Vote-skip and similar handlers run inside emit. Run the skip after that emit returns. */
  private scheduleSkip(roomId: string, trackId: string): void {
    this.deferredSkips = this.deferredSkips ?? []
    this.deferredSkips.push({ roomId, trackId })
    if (this.deferredSkipTimer != null) return
    this.deferredSkipTimer = setTimeout(() => {
      this.deferredSkipTimer = null
      const pending = this.deferredSkips
      this.deferredSkips = null
      if (pending) void this.flushDeferredSkips(pending)
    }, 0)
  }

  private async flushDeferredSkips(
    pending: { roomId: string; trackId: string }[],
  ): Promise<void> {
    const stillEmitting: { roomId: string; trackId: string }[] = []
    const ready: { roomId: string; trackId: string }[] = []
    for (const item of pending) {
      if (this.context.systemEvents?.isEmittingToPlugins?.(item.roomId)) {
        stillEmitting.push(item)
      } else {
        ready.push(item)
      }
    }
    for (const item of stillEmitting) this.scheduleSkip(item.roomId, item.trackId)
    for (const item of ready) {
      await this.runSkip(item.roomId, item.trackId)
    }
  }

  private async runSkip(roomId: string, trackId: string): Promise<void> {
    const { DJService } = await import("../../services/DJService")
    await new DJService(this.context).skipTrack(roomId, trackId, this.queueActor())
  }


  async updatePlaylistTrack(roomId: string, track: QueueItem): Promise<void> {
    if (!this.context.systemEvents) {
      console.warn("[PluginAPI] systemEvents not available, cannot update playlist track")
      return
    }

    await this.context.systemEvents.emit(roomId, "PLAYLIST_TRACK_UPDATED", {
      roomId,
      track,
    })
  }

  async getQueue(roomId: string): Promise<QueueItem[]> {
    const { getQueue } = await import("../../operations/data")
    return await getQueue({ context: this.context, roomId })
  }

  async setQueueSplit(
    roomId: string,
    belowKey: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    this.assertQueueWritable(roomId)
    if (!this.pluginName) {
      return { success: false, message: "Plugin identity is required." }
    }
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return djService.setQueueSplit(roomId, `plugin:${this.pluginName}`, belowKey, {
      source: { pluginName: this.pluginName },
    })
  }

  async removeQueueSplit(
    roomId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    this.assertQueueWritable(roomId)
    if (!this.pluginName) {
      return { success: false, message: "Plugin identity is required." }
    }
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return djService.removeQueueSplit(roomId, `plugin:${this.pluginName}`, {
      source: { pluginName: this.pluginName },
    })
  }

  async addToTrackQueue(
    roomId: string,
    metadataTrackId: string,
    options?: {
      addedBy?: QueueItemAttribution
      runPluginValidation?: boolean
      mediaSourceType?: string
    },
  ): Promise<{ success: true; queuedItem: QueueItem } | { success: false; message: string }> {
    this.assertQueueWritable(roomId)
    const attribution: QueueItemAttribution = options?.addedBy ?? {
      type: "plugin",
      pluginName: this.pluginName ?? "unknown-plugin",
    }

    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    const result = await djService.queueSongAs(roomId, attribution, metadataTrackId, {
      runPluginValidation: options?.runPluginValidation ?? false,
      mediaSourceType: options?.mediaSourceType,
    })

    if (result.success) {
      if (isDeferredQueueRequest(result)) {
        return { success: false, message: result.message }
      }
      return { success: true, queuedItem: result.queuedItem }
    }
    return { success: false, message: result.message }
  }

  async removeFromTrackQueue(
    roomId: string,
    metadataTrackId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    this.assertQueueWritable(roomId)
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.removeTrackFromQueue(roomId, metadataTrackId, this.queueActor())
  }

  async moveToTrackQueueTop(
    roomId: string,
    metadataTrackId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    this.assertQueueWritable(roomId)
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackToQueueTop(roomId, metadataTrackId, this.queueActor())
  }

  async moveToTrackQueueBottom(
    roomId: string,
    metadataTrackId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    this.assertQueueWritable(roomId)
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackToQueueBottom(roomId, metadataTrackId, this.queueActor())
  }

  async moveTrackByPosition(
    roomId: string,
    metadataTrackId: string,
    delta: number,
    actorUserId?: string,
  ): Promise<MoveTrackResult> {
    this.assertQueueWritable(roomId)
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackByPosition(
      roomId,
      metadataTrackId,
      delta,
      actorUserId,
      this.queueActor(),
    )
  }

  async shuffleTrackQueue(
    roomId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    this.assertQueueWritable(roomId)
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.shuffleQueue(roomId, this.queueActor())
  }

  async enqueueTracks(
    roomId: string,
    tracks: { trackId: string; mediaSourceType?: string }[],
    options?: {
      at?: "next" | "end" | number
      pin?: boolean
      addedBy?: QueueItemAttribution
    },
  ): Promise<
    | {
        success: true
        queued: QueueItem[]
        skipped: { trackId: string; message: string }[]
        blockId?: string
      }
    | { success: false; message: string; skipped?: { trackId: string; message: string }[] }
  > {
    this.assertQueueWritable(roomId)
    if (options?.pin && !this.pluginName) {
      return { success: false, message: "Plugin identity is required to pin a block." }
    }
    const attribution: QueueItemAttribution = options?.addedBy ?? {
      type: "plugin",
      pluginName: this.pluginName ?? "unknown-plugin",
    }
    const pin =
      options?.pin && this.pluginName
        ? { pluginName: this.pluginName, blockId: randomUUID() }
        : undefined

    const { DJService } = await import("../../services/DJService")
    const result = await new DJService(this.context).enqueueTracks(roomId, attribution, tracks, {
      at: options?.at,
      pin,
      ...this.queueActor(),
    })
    if (!result.success) return result
    return pin ? { ...result, blockId: pin.blockId } : result
  }

  async unpinQueueBlock(
    roomId: string,
    blockId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    this.assertQueueWritable(roomId)
    if (!this.pluginName) {
      return { success: false, message: "Plugin identity is required." }
    }
    const { DJService } = await import("../../services/DJService")
    return new DJService(this.context).unpinQueueBlock(roomId, this.pluginName, blockId)
  }

  private queueActor(): { actorPluginName?: string } {
    return this.pluginName ? { actorPluginName: this.pluginName } : {}
  }

  /** Core queue writes belong to DJService. Plugin handlers see the event after it is committed. */
  private assertQueueWritable(roomId: string): void {
    if (this.context.systemEvents?.isEmittingToPlugins?.(roomId)) {
      throw new QueueMutationDuringEmitError(roomId)
    }
  }
}

