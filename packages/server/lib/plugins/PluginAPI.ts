import {
  AppContext,
  MetadataSourceAccessAction,
  MoveTrackResult,
  PluginAPI,
  QueueItem,
  QueueItemAttribution,
  Reaction,
  User,
  ReactionSubject,
  ChatMessage,
  ScreenEffectTarget,
  ScreenEffectName,
  isDeferredQueueRequest,
  type LocalPlaylistArtwork,
} from "@repo/types"
import { Server } from "socket.io"
import { createHash } from "node:crypto"
import { getRoomPath } from "../getRoomPath"

function parseDataUri(dataUri: string): { mimeType: string; base64Data: string } | null {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUri)
  if (!match?.[1] || !match[2]) return null
  return { mimeType: match[1], base64Data: match[2] }
}

/** Stable per-playlist image id, versioned by artwork content. */
function playlistArtworkImageId(
  playlistId: string,
  base64Data: string,
  variant: "sm" | "lg" = "sm",
): string {
  const safeId = playlistId.replace(/[^a-zA-Z0-9_-]/g, "-")
  const hash = createHash("md5").update(base64Data).digest("hex").slice(0, 8)
  const base = `pl-cover-${safeId}-${hash}`
  return variant === "lg" ? `${base}-lg` : base
}

/** Stable per-album image id, versioned by artwork content. */
function albumArtworkImageId(
  albumId: string,
  base64Data: string,
  variant: "sm" | "lg" = "sm",
): string {
  const safeId = albumId.replace(/[^a-zA-Z0-9_-]/g, "-")
  const hash = createHash("md5").update(base64Data).digest("hex").slice(0, 8)
  const base = `al-cover-${safeId}-${hash}`
  return variant === "lg" ? `${base}-lg` : base
}

async function storePlaylistCover(params: {
  roomId: string
  playlistId: string
  dataUri: string
  variant: "sm" | "lg"
  apiUrl: string
  storeImage: (args: {
    roomId: string
    imageId: string
    base64Data: string
    mimeType: string
    context: AppContext
  }) => Promise<{ success: boolean }>
  context: AppContext
}): Promise<string | undefined> {
  const parsed = parseDataUri(params.dataUri)
  if (!parsed) return undefined
  const imageId = playlistArtworkImageId(params.playlistId, parsed.base64Data, params.variant)
  const stored = await params.storeImage({
    roomId: params.roomId,
    imageId,
    base64Data: parsed.base64Data,
    mimeType: parsed.mimeType,
    context: params.context,
  })
  if (!stored.success) return undefined
  return `${params.apiUrl}/api/rooms/${params.roomId}/images/${imageId}`
}

async function storeAlbumCover(params: {
  roomId: string
  albumId: string
  dataUri: string
  variant: "sm" | "lg"
  apiUrl: string
  storeImage: (args: {
    roomId: string
    imageId: string
    base64Data: string
    mimeType: string
    context: AppContext
  }) => Promise<{ success: boolean }>
  context: AppContext
}): Promise<string | undefined> {
  const parsed = parseDataUri(params.dataUri)
  if (!parsed) return undefined
  const imageId = albumArtworkImageId(params.albumId, parsed.base64Data, params.variant)
  const stored = await params.storeImage({
    roomId: params.roomId,
    imageId,
    base64Data: parsed.base64Data,
    mimeType: parsed.mimeType,
    context: params.context,
  })
  if (!stored.success) return undefined
  return `${params.apiUrl}/api/rooms/${params.roomId}/images/${imageId}`
}

/**
 * Implementation of the Plugin API
 * Provides safe, high-level methods for plugins to interact with the system
 */
export class PluginAPIImpl implements PluginAPI {
  private pluginName: string | null = null
  private roomId: string | null = null
  private contributesUserGameState = false
  /** Rooms that already queued USER_GAME_STATE_INVALIDATED this event-loop turn. */
  private static invalidationPending = new Set<string>()

  constructor(
    private readonly context: AppContext,
    private readonly io: Server,
  ) {}

  /**
   * Set the plugin context for namespacing events.
   * Called by PluginRegistry when creating the context for a plugin.
   */
  setPluginContext(
    pluginName: string,
    roomId: string,
    options?: { contributesUserGameState?: boolean },
  ): void {
    this.pluginName = pluginName
    this.roomId = roomId
    this.contributesUserGameState = options?.contributesUserGameState === true
  }

  /**
   * Create a scoped API instance for a specific plugin and room.
   * This ensures emit() has the correct namespace.
   */
  forPlugin(
    pluginName: string,
    roomId: string,
    options?: { contributesUserGameState?: boolean },
  ): PluginAPI {
    const scoped = new PluginAPIImpl(this.context, this.io)
    scoped.setPluginContext(pluginName, roomId, options)
    return scoped
  }

  async getNowPlaying(roomId: string): Promise<QueueItem | null> {
    const { getRoomCurrent } = await import("../../operations/data")
    const current = await getRoomCurrent({ context: this.context, roomId })
    return current?.nowPlaying ?? null
  }

  async getReactions(params: {
    roomId: string
    reactTo: ReactionSubject
    filterEmoji?: string
  }): Promise<Reaction[]> {
    const { getReactionsForSubject } = await import("../../operations/data")
    const reactions = await getReactionsForSubject({
      context: this.context,
      roomId: params.roomId,
      reactTo: params.reactTo,
    })

    if (params.filterEmoji) {
      // Note: reactions are actually ReactionPayload objects with Emoji type
      return reactions.filter((r: any) => r.emoji?.shortcodes === params.filterEmoji)
    }

    return reactions
  }

  async getUsers(
    roomId: string,
    params?: { status?: "listening" | "participating" },
  ): Promise<User[]> {
    const { getRoomUsers } = await import("../../operations/data")
    const users = await getRoomUsers({ context: this.context, roomId })

    // Filter by status if specified
    if (params?.status) {
      return users.filter((user) => user.status === params.status)
    }

    return users
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    const { getUsersByIds } = await import("../../operations/data")
    return getUsersByIds({ context: this.context, userIds })
  }

  async isUserInRoom(roomId: string, userId: string): Promise<boolean> {
    const { getOnlineUserSocketId } = await import("../../operations/data")
    return (await getOnlineUserSocketId({ context: this.context, roomId, userId })) != null
  }

  async getOnlineUserIds(roomId: string): Promise<string[]> {
    const { getOnlineUserIds } = await import("../../operations/data")
    return getOnlineUserIds({ context: this.context, roomId })
  }

  async isRoomAdmin(roomId: string, userId: string): Promise<boolean> {
    const { findRoom, isRoomAdmin } = await import("../../operations/data")
    const room = await findRoom({ context: this.context, roomId })
    if (!room) return false
    return isRoomAdmin({
      context: this.context,
      roomId,
      userId,
      roomCreator: room.creator,
    })
  }

  async skipTrack(roomId: string, trackId: string): Promise<void> {
    // Verify the track is still playing before skipping
    const nowPlaying = await this.getNowPlaying(roomId)

    if (!nowPlaying || nowPlaying.mediaSource.trackId !== trackId) {
      console.log(`[PluginAPI] Skip aborted: track ${trackId} is not currently playing`)
      return
    }

    const {
      findRoom,
      popNextFromQueue,
      setDispatchedTrack,
      buildQueueChangedData,
      clearDispatchedTrack,
    } = await import("../../operations/data")
    const { isAppControlledPlayback } = await import("../roomTypeHelpers")

    const room = await findRoom({ context: this.context, roomId })
    if (!room) {
      throw new Error(`Room not found: ${roomId}`)
    }

    const { AdapterService } = await import("../../services/AdapterService")
    const adapterService = new AdapterService(this.context)
    const playbackController = await adapterService.getRoomPlaybackController(roomId)

    if (!playbackController) {
      throw new Error(`No playback controller found for room ${roomId}`)
    }

    if (!isAppControlledPlayback(room)) {
      await playbackController.api.skipToNextTrack()
      return
    }

    const nextItem: QueueItem | null = await popNextFromQueue({ context: this.context, roomId })

    // App queue is authoritative, but with nothing queued fall back to Spotify skip.
    if (!nextItem) {
      await playbackController.api.skipToNextTrack()
      return
    }

    await setDispatchedTrack({ context: this.context, roomId, item: nextItem })

    const uri = nextItem.track.urls?.find((u) => u.type === "resource")?.url
    if (!uri) {
      console.error("[PluginAPI] skipTrack: no resource URI for next track")
      await clearDispatchedTrack({ context: this.context, roomId })
      await playbackController.api.skipToNextTrack()
      return
    }

    await this.context.pluginRegistry?.runBeforePlayQueuedTrack({
      roomId,
      item: nextItem,
      reason: "plugin-skip",
    })

    try {
      await playbackController.api.playTrack(uri)
    } catch (e) {
      console.error("[PluginAPI] skipTrack: playTrack failed:", e)
      await clearDispatchedTrack({ context: this.context, roomId })
      return
    }

    if (this.context.systemEvents) {
      const payload = await buildQueueChangedData({
        roomId,
        context: this.context,
        appControlled: true,
      })
      await this.context.systemEvents.emit(roomId, "QUEUE_CHANGED", payload)
    }
  }

  async sendSystemMessage(
    roomId: string,
    message: string,
    meta?: ChatMessage["meta"],
    mentions?: ChatMessage["mentions"],
  ): Promise<void> {
    const { default: sendMessage } = await import("../../lib/sendMessage")
    const { default: systemMessage } = await import("../../lib/systemMessage")

    const msg = systemMessage(message, meta, mentions)

    await sendMessage(this.io, roomId, msg, this.context)
  }

  async sendUserSystemMessage(
    roomId: string,
    userId: string,
    message: string,
    meta?: ChatMessage["meta"],
  ): Promise<void> {
    const { default: systemMessage } = await import("../../lib/systemMessage")
    const { getOnlineUserSocketId } = await import("../../operations/data")

    const socketId = await getOnlineUserSocketId({ context: this.context, roomId, userId })
    if (!socketId) {
      console.warn(
        `[PluginAPI] sendUserSystemMessage: no connected socket for userId ${userId} in room ${roomId}`,
      )
      return
    }

    const msg = systemMessage(message, meta)
    this.io.to(socketId).emit("event", {
      type: "MESSAGE_RECEIVED",
      data: {
        roomId,
        message: msg,
      },
    })
  }

  async sendUserToast(
    roomId: string,
    userId: string,
    toast: {
      title: string
      description?: string
      type?: "info" | "success" | "warning" | "error"
      duration?: number
      id?: string
      source?: string
    },
  ): Promise<void> {
    const { getOnlineUserSocketId } = await import("../../operations/data")
    const socketId = await getOnlineUserSocketId({ context: this.context, roomId, userId })
    if (!socketId) {
      console.warn(
        `[PluginAPI] sendUserToast: no connected socket for userId ${userId} in room ${roomId}`,
      )
      return
    }

    this.io.to(socketId).emit("event", {
      type: "USER_TOAST",
      data: {
        roomId,
        ...toast,
      },
    })
  }

  async getPluginConfig(roomId: string, pluginName: string): Promise<any | null> {
    // Plugin runtime sees the MERGED config (public + private/server-only fields, ADR 0068).
    const { getMergedPluginConfig } = await import("../../operations/data/pluginConfigs")
    return await getMergedPluginConfig({ context: this.context, roomId, pluginName })
  }

  async setPluginConfig(roomId: string, pluginName: string, config: any): Promise<void> {
    const { setPluginConfig } = await import("../../operations/data/pluginConfigs")
    await setPluginConfig({ context: this.context, roomId, pluginName, config })
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

  async createPoll(params: {
    roomId: string
    userId: string
    question: string
    options: { label: string }[]
    settings?: { hideRunningTotal?: boolean }
    announce?: boolean
  }) {
    if (!this.pluginName) {
      return {
        ok: false as const,
        error: {
          status: 403,
          error: "Forbidden",
          message: "Plugin identity is required.",
        },
      }
    }
    const { createPoll } = await import("../../operations/polls")
    return createPoll({
      context: this.context,
      roomId: params.roomId,
      userId: params.userId,
      question: params.question,
      options: params.options,
      settings: params.settings,
      announce: params.announce,
      source: { pluginName: this.pluginName },
    })
  }

  async closePoll(params: {
    roomId: string
    userId: string
    pollId: string
    announce?: boolean
  }) {
    if (!this.pluginName) {
      return {
        ok: false as const,
        error: {
          status: 403,
          error: "Forbidden",
          message: "Plugin identity is required.",
        },
      }
    }
    const { closePoll } = await import("../../operations/polls")
    return closePoll({
      context: this.context,
      roomId: params.roomId,
      userId: params.userId,
      pollId: params.pollId,
      announce: params.announce,
      source: { pluginName: this.pluginName },
    })
  }

  async getActivePoll(roomId: string) {
    const { getActivePollId, getPoll } = await import("../../operations/data")
    const pollId = await getActivePollId({ context: this.context, roomId })
    if (!pollId) return null
    return getPoll({ context: this.context, roomId, pollId })
  }

  async getPollVoterIds(roomId: string, pollId: string): Promise<string[]> {
    const { getPollVoterIds } = await import("../../operations/data")
    return getPollVoterIds({ context: this.context, roomId, pollId })
  }

  async getPollVotes(roomId: string, pollId: string): Promise<Record<string, string>> {
    const { getPollVotes } = await import("../../operations/data")
    return getPollVotes({ context: this.context, roomId, pollId })
  }

  async setQueueSplit(
    roomId: string,
    belowKey: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
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
      suppressQueueChanged?: boolean
    },
  ): Promise<{ success: true; queuedItem: QueueItem } | { success: false; message: string }> {
    const attribution: QueueItemAttribution = options?.addedBy ?? {
      type: "plugin",
      pluginName: this.pluginName ?? "unknown-plugin",
    }

    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    const result = await djService.queueSongAs(roomId, attribution, metadataTrackId, {
      runPluginValidation: options?.runPluginValidation ?? false,
      mediaSourceType: options?.mediaSourceType,
      suppressQueueChanged: options?.suppressQueueChanged,
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
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.removeTrackFromQueue(roomId, metadataTrackId)
  }

  async moveToTrackQueueTop(
    roomId: string,
    metadataTrackId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackToQueueTop(roomId, metadataTrackId)
  }

  async moveToTrackQueueBottom(
    roomId: string,
    metadataTrackId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackToQueueBottom(roomId, metadataTrackId)
  }

  async moveTrackByPosition(
    roomId: string,
    metadataTrackId: string,
    delta: number,
    actorUserId?: string,
  ): Promise<MoveTrackResult> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.moveTrackByPosition(roomId, metadataTrackId, delta, actorUserId)
  }

  async shuffleTrackQueue(
    roomId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const { DJService } = await import("../../services/DJService")
    const djService = new DJService(this.context)
    return await djService.shuffleQueue(roomId)
  }

  async setPlaybackVolume(
    roomId: string,
    volumePercent: number,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const clamped = Math.round(Math.max(0, Math.min(100, volumePercent)))

    const { AdapterService } = await import("../../services/AdapterService")
    const adapterService = new AdapterService(this.context)
    const playbackController = await adapterService.getRoomPlaybackController(roomId)

    if (!playbackController) {
      return { success: false, message: "No playback controller configured for this room" }
    }

    const setVolume = playbackController.api.setVolume
    if (!setVolume) {
      return { success: false, message: "Playback controller does not support volume control" }
    }

    try {
      await setVolume(clamped)
      return { success: true }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to set playback volume"
      console.error("[PluginAPI] setPlaybackVolume failed:", error)
      return { success: false, message }
    }
  }

  async supportsVolumeControl(roomId: string): Promise<boolean> {
    const { AdapterService } = await import("../../services/AdapterService")
    const adapterService = new AdapterService(this.context)
    const playbackController = await adapterService.getRoomPlaybackController(roomId)
    return Boolean(playbackController?.api.setVolume)
  }

  private async getMetadataSourceAccess() {
    const { MetadataSourceAccessService } = await import(
      "../../services/MetadataSourceAccessService"
    )
    return (
      (this.context as { metadataSourceAccess?: InstanceType<typeof MetadataSourceAccessService> })
        .metadataSourceAccess ?? new MetadataSourceAccessService(this.context)
    )
  }

  async listMetadataSources(roomId: string): Promise<{ id: string; label: string }[]> {
    const access = await this.getMetadataSourceAccess()
    return access.listMetadataSources(roomId)
  }

  async canAccessMetadataSource(params: {
    roomId: string
    userId: string
    sourceId: string
    action: MetadataSourceAccessAction
  }): Promise<boolean> {
    const access = await this.getMetadataSourceAccess()
    return access.canAccess(params)
  }

  async getEffectiveMetadataSourceIds(
    roomId: string,
    userId: string,
    action: MetadataSourceAccessAction,
  ): Promise<string[]> {
    const access = await this.getMetadataSourceAccess()
    return access.getEffectiveSourceIdsForUser(roomId, userId, action)
  }

  async checkLocalTrackPlaylistMembership(params: {
    roomId: string
    trackId: string
    playlistIds?: string[]
    albumIds?: string[]
    includeTrackAlbumId?: boolean
    firstMatch?: boolean
  }): Promise<{ playlistIds: string[]; albumIds: string[] }> {
    const {
      roomId,
      trackId,
      playlistIds = [],
      albumIds = [],
      includeTrackAlbumId = false,
      firstMatch = false,
    } = params
    const empty = { playlistIds: [] as string[], albumIds: [] as string[] }
    if (
      !trackId ||
      (playlistIds.length === 0 && albumIds.length === 0 && !includeTrackAlbumId)
    ) {
      return empty
    }
    try {
      const { getBridgeRpcClient, checkLocalTrackPlaylistMembership } = await import(
        "@repo/adapter-bridge"
      )
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return empty
      return await checkLocalTrackPlaylistMembership({
        rpc,
        trackId,
        playlistIds,
        albumIds,
        includeTrackAlbumId,
        firstMatch,
      })
    } catch (e) {
      console.warn("[PluginAPI] checkLocalTrackPlaylistMembership failed:", e)
      return empty
    }
  }

  async checkLocalTrackPlaylistMembershipBatch(params: {
    roomId: string
    trackIds: readonly string[]
    playlistIds?: string[]
    albumIds?: string[]
    includeTrackAlbumId?: boolean
    firstMatch?: boolean
  }): Promise<Map<string, { playlistIds: string[]; albumIds: string[] }>> {
    const empty = new Map<string, { playlistIds: string[]; albumIds: string[] }>()
    try {
      const { getBridgeRpcClient, checkLocalTrackPlaylistMembershipBatch } = await import(
        "@repo/adapter-bridge"
      )
      const rpc = getBridgeRpcClient(params.roomId)
      if (!rpc) return empty
      return await checkLocalTrackPlaylistMembershipBatch({
        rpc,
        trackIds: params.trackIds,
        playlistIds: params.playlistIds,
        albumIds: params.albumIds,
        includeTrackAlbumId: params.includeTrackAlbumId,
        firstMatch: params.firstMatch,
      })
    } catch (e) {
      console.warn("[PluginAPI] checkLocalTrackPlaylistMembershipBatch failed:", e)
      return empty
    }
  }

  async listLocalPlaylists(
    roomId: string,
  ): Promise<Array<{ id: string; name: string; songCount?: number; comment?: string }>> {
    try {
      const { getBridgeRpcClient, listLocalPlaylists } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLocalPlaylists({ rpc })
    } catch (e) {
      console.warn("[PluginAPI] listLocalPlaylists failed:", e)
      return []
    }
  }

  /**
   * Fetch playlist cover art from the daemon and park it in the room image store,
   * returning served URLs. The image id embeds a content hash so swapped artwork
   * gets a new URL despite the long-lived cache headers on the image route.
   * Row (`imageUrl`) and feature (`imageUrlLarge`) variants are stored separately.
   */
  async getLocalPlaylistArtwork(
    roomId: string,
    playlistIds: string[],
  ): Promise<Record<string, LocalPlaylistArtwork>> {
    const ids = [...new Set(playlistIds.map((id) => id.trim()).filter(Boolean))]
    if (ids.length === 0) return {}
    try {
      const { getBridgeRpcClient, getLocalPlaylistCoverArt } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return {}
      const covers = await getLocalPlaylistCoverArt({ rpc, playlistIds: ids })
      const { storeImage } = await import("../../operations/data")
      const apiUrl = this.context.apiUrl || ""
      const urls: Record<string, LocalPlaylistArtwork> = {}
      for (const [playlistId, variants] of Object.entries(covers)) {
        const art: LocalPlaylistArtwork = {}
        if (variants.sm) {
          const url = await storePlaylistCover({
            roomId,
            playlistId,
            dataUri: variants.sm,
            variant: "sm",
            apiUrl,
            storeImage,
            context: this.context,
          })
          if (url) art.imageUrl = url
        }
        if (variants.lg) {
          const url = await storePlaylistCover({
            roomId,
            playlistId,
            dataUri: variants.lg,
            variant: "lg",
            apiUrl,
            storeImage,
            context: this.context,
          })
          if (url) art.imageUrlLarge = url
        }
        if (!art.imageUrl && art.imageUrlLarge) art.imageUrl = art.imageUrlLarge
        if (art.imageUrl || art.imageUrlLarge) urls[playlistId] = art
      }
      return urls
    } catch (e) {
      console.warn("[PluginAPI] getLocalPlaylistArtwork failed:", e)
      return {}
    }
  }

  /**
   * List Navidrome albums for Physical Media album-catalog derivation.
   * Returns [] when offline / old DJ Mac pack (unknown RPC).
   */
  async listLibraryAlbums(
    roomId: string,
  ): Promise<
    Array<{
      id: string
      name: string
      artist?: string
      year?: number
      songCount?: number
      coverArt?: string
      userRating?: number
    }>
  > {
    try {
      const { getBridgeRpcClient, listLibraryAlbums } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLibraryAlbums({ rpc })
    } catch (e) {
      console.warn("[PluginAPI] listLibraryAlbums failed:", e)
      return []
    }
  }

  /**
   * Album cover art URLs re-hosted in the room image store (`al-cover-…`).
   */
  async getLocalAlbumArtwork(
    roomId: string,
    albumIds: string[],
  ): Promise<Record<string, LocalPlaylistArtwork>> {
    const ids = [...new Set(albumIds.map((id) => id.trim()).filter(Boolean))]
    if (ids.length === 0) return {}
    try {
      const { getBridgeRpcClient, getLocalAlbumCoverArt } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return {}
      const covers = await getLocalAlbumCoverArt({ rpc, albumIds: ids })
      const { storeImage } = await import("../../operations/data")
      const apiUrl = this.context.apiUrl || ""
      const urls: Record<string, LocalPlaylistArtwork> = {}
      for (const [albumId, variants] of Object.entries(covers)) {
        const art: LocalPlaylistArtwork = {}
        if (variants.sm) {
          const url = await storeAlbumCover({
            roomId,
            albumId,
            dataUri: variants.sm,
            variant: "sm",
            apiUrl,
            storeImage,
            context: this.context,
          })
          if (url) art.imageUrl = url
        }
        if (variants.lg) {
          const url = await storeAlbumCover({
            roomId,
            albumId,
            dataUri: variants.lg,
            variant: "lg",
            apiUrl,
            storeImage,
            context: this.context,
          })
          if (url) art.imageUrlLarge = url
        }
        if (!art.imageUrl && art.imageUrlLarge) art.imageUrl = art.imageUrlLarge
        if (art.imageUrl || art.imageUrlLarge) urls[albumId] = art
      }
      return urls
    } catch (e) {
      console.warn("[PluginAPI] getLocalAlbumArtwork failed:", e)
      return {}
    }
  }

  /**
   * Ordered track ids for a Navidrome album (de-dup / lean listing). Empty on failure.
   * Prefers `listAlbumTrackIds` RPC; falls back to getAlbum on old packs.
   */
  async listLocalAlbumTrackIds(roomId: string, albumId: string): Promise<string[]> {
    const id = albumId.trim()
    if (!id) return []
    try {
      const { getBridgeRpcClient, listLocalAlbumTrackIds } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLocalAlbumTrackIds({ rpc, albumId: id })
    } catch (e) {
      console.warn("[PluginAPI] listLocalAlbumTrackIds failed:", e)
      return []
    }
  }

  async invalidateLocalLibraryCache(roomId: string): Promise<boolean> {
    try {
      const { metadataBrowseRoomPrefix } = await import("@repo/utils")
      await this.context.cache?.deleteByPrefix(metadataBrowseRoomPrefix(roomId))

      const { getBridgeRpcClient, invalidateLocalLibraryCache } = await import(
        "@repo/adapter-bridge"
      )
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return true
      return await invalidateLocalLibraryCache({ rpc })
    } catch (e) {
      console.warn("[PluginAPI] invalidateLocalLibraryCache failed:", e)
      return false
    }
  }

  async listLocalPlaylistTracks(
    roomId: string,
    playlistId: string,
  ): Promise<import("@repo/types").MetadataSourceTrack[]> {
    try {
      const { getBridgeRpcClient, listLocalPlaylistTracks } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLocalPlaylistTracks({ rpc, playlistId })
    } catch (e) {
      console.warn("[PluginAPI] listLocalPlaylistTracks failed:", e)
      return []
    }
  }

  /**
   * Ordered playlist track ids (+ albumId) without full track mapping (de-dup).
   * [] when offline / old DJ Mac pack.
   */
  async listLocalPlaylistTrackIds(
    roomId: string,
    playlistId: string,
  ): Promise<Array<{ id: string; albumId?: string }>> {
    try {
      const { getBridgeRpcClient, listLocalPlaylistTrackIds } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return []
      return await listLocalPlaylistTrackIds({ rpc, playlistId })
    } catch (e) {
      console.warn("[PluginAPI] listLocalPlaylistTrackIds failed:", e)
      return []
    }
  }

  /**
   * Emit a custom plugin event.
   * Events are namespaced as PLUGIN:{pluginName}:{eventName}
   *
   * Note: Plugin events emit directly to Socket.IO rather than through SystemEvents
   * because they are:
   * 1. Dynamically named (not typed in SystemEventTypes)
   * 2. Room-specific only (don't need lobby or cross-server broadcasting)
   * 3. Already properly namespaced to avoid conflicts
   */
  async emit<T extends Record<string, unknown>>(
    eventName: string,
    data: T,
    options?: { invalidatesUserState?: boolean },
  ): Promise<void> {
    if (!this.pluginName || !this.roomId) {
      console.warn("[PluginAPI] Cannot emit event: plugin context not set")
      return
    }

    // Create namespaced event name: PLUGIN:{pluginName}:{eventName}
    const namespacedEvent = `PLUGIN:${this.pluginName}:${eventName}`

    // Add roomId to payload
    const payload = {
      roomId: this.roomId,
      ...data,
    }

    console.log(`[PluginAPI] Emitting ${namespacedEvent}`, payload)

    // Broadcast to room via Socket.IO (direct emission is intentional - see above)
    this.io.to(getRoomPath(this.roomId)).emit("event", {
      type: namespacedEvent,
      data: payload,
    })

    // Contributors: one room-wide invalidation per event-loop turn (ADR 0097 / 0154).
    // Default true so existing plugins keep refetching; pass false when the
    // payload carries no per-user data.
    if (this.contributesUserGameState && options?.invalidatesUserState !== false) {
      this.queueUserGameStateInvalidation()
    }
  }

  private queueUserGameStateInvalidation(): void {
    if (!this.pluginName || !this.roomId) return
    const roomId = this.roomId
    const pluginName = this.pluginName
    if (PluginAPIImpl.invalidationPending.has(roomId)) return
    PluginAPIImpl.invalidationPending.add(roomId)
    queueMicrotask(() => {
      PluginAPIImpl.invalidationPending.delete(roomId)
      this.io.to(getRoomPath(roomId)).emit("event", {
        type: "USER_GAME_STATE_INVALIDATED",
        data: { roomId, pluginName },
      })
    })
  }

  async requestGameStateTabAttention(params: {
    userId: string
    tabId: string
  }): Promise<void> {
    if (!this.pluginName || !this.roomId) {
      console.warn("[PluginAPI] Cannot request tab attention: plugin context not set")
      return
    }

    // Client game-state tabs are keyed as `${pluginName}:${schemaTabId}`
    // (see useGameStatePluginTabEntries). Accept bare schema ids from plugins.
    const tabId = params.tabId.includes(":")
      ? params.tabId
      : `${this.pluginName}:${params.tabId}`

    const { getOnlineUserSocketId } = await import("../../operations/data")
    const socketId = await getOnlineUserSocketId({
      context: this.context,
      roomId: this.roomId,
      userId: params.userId,
    })
    if (!socketId) {
      console.warn(
        `[PluginAPI] requestGameStateTabAttention: no connected socket for userId ${params.userId} in room ${this.roomId}`,
      )
      return
    }

    this.io.to(socketId).emit("event", {
      type: "PLUGIN_TAB_ATTENTION",
      data: {
        roomId: this.roomId,
        pluginName: this.pluginName,
        tabId,
        userId: params.userId,
      },
    })
  }

  /**
   * Queue a sound effect. Omit `userId` for room-wide playback; set `userId`
   * to emit only to that user's socket (ADR 0072).
   */
  async queueSoundEffect(params: {
    url: string
    volume?: number
    userId?: string
  }): Promise<void> {
    if (!this.roomId) {
      console.warn("[PluginAPI] Cannot queue sound effect: room context not set")
      return
    }

    const volume = params.volume ?? 1.0
    const payload = {
      roomId: this.roomId,
      url: params.url,
      volume,
      ...(params.userId !== undefined ? { userId: params.userId } : {}),
    }

    // User-targeted: private socket emit (same delivery model as sendUserSystemMessage).
    if (params.userId) {
      const { getOnlineUserSocketId } = await import("../../operations/data")
      const socketId = await getOnlineUserSocketId({
        context: this.context,
        roomId: this.roomId,
        userId: params.userId,
      })
      if (!socketId) {
        console.warn(
          `[PluginAPI] queueSoundEffect: no connected socket for userId ${params.userId} in room ${this.roomId}`,
        )
        return
      }
      this.io.to(socketId).emit("event", {
        type: "SOUND_EFFECT_QUEUED",
        data: payload,
      })
      return
    }

    if (!this.context.systemEvents) {
      console.warn("[PluginAPI] systemEvents not available, cannot queue sound effect")
      return
    }

    await this.context.systemEvents.emit(this.roomId, "SOUND_EFFECT_QUEUED", payload)
  }

  /**
   * Queue a screen effect (CSS animation). Omit `recipientUserId` for room-wide
   * delivery; set it to emit only to that user's socket (ADR 0073).
   * `recipientUserId` is delivery scoping — orthogonal to `target: "user"`.
   */
  async queueScreenEffect(params: {
    target: ScreenEffectTarget
    targetId?: string
    effect: ScreenEffectName
    duration?: number
    recipientUserId?: string
  }): Promise<void> {
    if (!this.roomId) {
      console.warn("[PluginAPI] Cannot queue screen effect: room context not set")
      return
    }

    const payload = {
      roomId: this.roomId,
      target: params.target,
      targetId: params.targetId,
      effect: params.effect,
      duration: params.duration,
      ...(params.recipientUserId !== undefined
        ? { recipientUserId: params.recipientUserId }
        : {}),
    }

    // Recipient-targeted: private socket emit (same delivery model as queueSoundEffect).
    if (params.recipientUserId) {
      const { getOnlineUserSocketId } = await import("../../operations/data")
      const socketId = await getOnlineUserSocketId({
        context: this.context,
        roomId: this.roomId,
        userId: params.recipientUserId,
      })
      if (!socketId) {
        console.warn(
          `[PluginAPI] queueScreenEffect: no connected socket for recipientUserId ${params.recipientUserId} in room ${this.roomId}`,
        )
        return
      }
      this.io.to(socketId).emit("event", {
        type: "SCREEN_EFFECT_QUEUED",
        data: payload,
      })
      return
    }

    if (!this.context.systemEvents) {
      console.warn("[PluginAPI] systemEvents not available, cannot queue screen effect")
      return
    }

    await this.context.systemEvents.emit(this.roomId, "SCREEN_EFFECT_QUEUED", payload)
  }
}
