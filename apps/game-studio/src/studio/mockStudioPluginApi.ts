import { shuffleQueueItems } from "@repo/game-logic"
import { queueItemFactory } from "@repo/factories/queueItem"
import type {
  ChatMessage,
  Emoji,
  LocalPlaylistArtwork,
  PluginCatalogTrack,
  PluginPlaybackReadResult,
  PluginScheduleAnchor,
  Poll,
  PollResults,
  MetadataSourceAccessAction,
  MoveTrackResult,
  PluginAPI,
  QueueItem,
  QueueItemAttribution,
  Reaction,
  ScreenEffectName,
  ScreenEffectTarget,
  User,
} from "@repo/types"
import { labelForMetadataSource } from "@repo/types"
import type { ReactionSubject } from "@repo/types"
import type { MockPluginLifecycle } from "./mockLifecycle"
import type { StudioRoom } from "./studioRoom"
import { isoNow } from "./constants"
import { studioSystemMessage } from "./chatHelpers"
import { checkQueueDefenseStudio } from "./studioDefense"

type StudioSchedule = {
  id: string
  kind: string
  fireAt: number
  payload: unknown
  timer: ReturnType<typeof setTimeout>
}

const NOT_IMPLEMENTED = { success: false, message: "Not implemented in Game Studio" } as const
const POLL_NOT_IMPLEMENTED = {
  ok: false,
  error: { status: 501, error: "Not Implemented", message: "Polls are not implemented in Game Studio" },
} as const

export class MockStudioPluginApi implements PluginAPI {
  private readonly schedules = new Map<string, StudioSchedule>()
  private scheduleHandler:
    | ((kind: string, payload: unknown, scheduleId: string) => Promise<void> | void)
    | null = null

  constructor(
    private readonly room: StudioRoom,
    private readonly lifecycle: MockPluginLifecycle,
    private readonly pluginName: string,
  ) {}

  /** Routes fired schedules to the plugin (the server uses PluginScheduler for this). */
  setScheduleHandler(
    handler: (kind: string, payload: unknown, scheduleId: string) => Promise<void> | void,
  ): void {
    this.scheduleHandler = handler
  }

  async schedule(params: {
    id: string
    kind: string
    at?: number | null
    durationMs?: number | null
    anchor?: PluginScheduleAnchor | null
    payload?: unknown
  }): Promise<
    | { ok: true; fireAt: number; anchored?: boolean; paused?: boolean }
    | { ok: false; message: string }
  > {
    const fireAt = params.at ?? (params.durationMs != null ? Date.now() + params.durationMs : null)
    if (fireAt == null) return { ok: false, message: "Game Studio needs `at` or `durationMs`" }
    await this.cancelSchedule(params.id)
    const timer = setTimeout(
      () => {
        this.schedules.delete(params.id)
        void this.scheduleHandler?.(params.kind, params.payload, params.id)
      },
      Math.max(0, fireAt - Date.now()),
    )
    this.schedules.set(params.id, {
      id: params.id,
      kind: params.kind,
      fireAt,
      payload: params.payload,
      timer,
    })
    return { ok: true, fireAt }
  }

  async cancelSchedule(id: string): Promise<boolean> {
    const s = this.schedules.get(id)
    if (!s) return false
    clearTimeout(s.timer)
    this.schedules.delete(id)
    return true
  }

  async getSchedule(
    id: string,
  ): Promise<{ id: string; kind: string; fireAt: number; payload: unknown } | null> {
    const s = this.schedules.get(id)
    return s ? { id: s.id, kind: s.kind, fireAt: s.fireAt, payload: s.payload } : null
  }

  async spawnEphemeralUser(
    _roomId: string,
    params: { username: string; userId?: string },
  ): Promise<User> {
    const user: User = {
      userId: params.userId ?? `ephemeral-${crypto.randomUUID()}`,
      username: params.username,
      status: "participating",
    }
    this.room.addUser(user)
    return user
  }

  async despawnEphemeralUser(_roomId: string, userId: string): Promise<void> {
    this.room.removeUser(userId)
  }

  async sendChatMessageAsUser(_roomId: string, userId: string, content: string): Promise<void> {
    const u = this.room.users.get(userId)
    this.room.appendChat({
      user: { userId, username: u?.username ?? userId },
      content,
      timestamp: isoNow(),
      mentions: [],
    })
  }

  async addReactionAsUser(
    roomId: string,
    userId: string,
    emoji: Emoji,
    reactTo: ReactionSubject,
  ): Promise<void> {
    this.room.addReaction(roomId, reactTo, { emoji: emoji.shortcodes, user: userId })
  }

  async removeReactionAsUser(
    roomId: string,
    userId: string,
    emoji: Emoji,
    reactTo: ReactionSubject,
  ): Promise<void> {
    this.room.removeReaction(roomId, reactTo, { emoji: emoji.shortcodes, user: userId })
  }

  async createPoll(): Promise<
    | { ok: true; poll: Poll }
    | { ok: false; error: { status: number; error: string; message: string } }
  > {
    return POLL_NOT_IMPLEMENTED
  }

  async closePoll(): Promise<
    | { ok: true; poll: Poll; results: PollResults }
    | { ok: false; error: { status: number; error: string; message: string } }
  > {
    return POLL_NOT_IMPLEMENTED
  }

  async getActivePoll(_roomId: string): Promise<Poll | null> {
    return this.room.activePoll
  }

  async requestCapability(): Promise<{ ok: false; reason: "unsupported" }> {
    return { ok: false, reason: "unsupported" }
  }

  async getPollVoterIds(_roomId: string, pollId: string): Promise<string[]> {
    return this.room.activePoll?.id === pollId ? [...this.room.pollVotes.keys()] : []
  }

  async getPollVotes(_roomId: string, pollId: string): Promise<Record<string, string>> {
    return this.room.activePoll?.id === pollId ? Object.fromEntries(this.room.pollVotes) : {}
  }

  async tallyPoll(
    pollId: string,
    options?: { excludeUserIds?: string[] },
  ): Promise<Record<string, number>> {
    if (this.room.activePoll?.id !== pollId) return {}
    const excluded = new Set(options?.excludeUserIds ?? [])
    const counts: Record<string, number> = {}
    for (const [userId, optionId] of this.room.pollVotes) {
      if (excluded.has(userId)) continue
      counts[optionId] = (counts[optionId] ?? 0) + 1
    }
    return counts
  }

  async setQueueSplit(): Promise<{ success: true } | { success: false; message: string }> {
    return NOT_IMPLEMENTED
  }

  async removeQueueSplit(): Promise<{ success: true } | { success: false; message: string }> {
    return NOT_IMPLEMENTED
  }

  async enqueueTracks(): Promise<
    | { success: true; queued: QueueItem[]; skipped: { trackId: string; message: string }[] }
    | { success: false; message: string }
  > {
    return NOT_IMPLEMENTED
  }

  async unpinQueueBlock(): Promise<{ success: true } | { success: false; message: string }> {
    return NOT_IMPLEMENTED
  }

  async getPlayback(_roomId: string): Promise<PluginPlaybackReadResult> {
    return NOT_IMPLEMENTED
  }

  async pausePlayback(): Promise<{ success: true } | { success: false; message: string }> {
    return NOT_IMPLEMENTED
  }

  async resumePlayback(): Promise<{ success: true } | { success: false; message: string }> {
    return NOT_IMPLEMENTED
  }

  async seekPlayback(): Promise<
    { success: true; positionMs: number } | { success: false; message: string }
  > {
    return NOT_IMPLEMENTED
  }

  async searchTracks(): Promise<
    { success: true; tracks: PluginCatalogTrack[] } | { success: false; message: string }
  > {
    return NOT_IMPLEMENTED
  }

  async getNowPlaying(): Promise<QueueItem | null> {
    return this.room.queue[0] ?? null
  }

  async getReactions(_params: {
    roomId: string
    reactTo: ReactionSubject
    filterEmoji?: string
  }): Promise<Reaction[]> {
    return this.room.getReactions(_params.roomId, _params.reactTo)
  }

  async getUsers(_roomId: string): Promise<User[]> {
    return [...this.room.users.values()]
  }

  async getOnlineUserIds(_roomId: string): Promise<string[]> {
    return [...this.room.users.keys()]
  }

  async getUsersByIds(userIds: string[]): Promise<User[]> {
    return userIds.map((id) => {
      const u = this.room.users.get(id)
      if (u) return u
      return { userId: id, username: id }
    })
  }

  async isUserInRoom(_roomId: string, userId: string): Promise<boolean> {
    return this.room.users.has(userId)
  }

  async isRoomAdmin(_roomId: string, userId: string): Promise<boolean> {
    const user = this.room.users.get(userId)
    return Boolean(user?.isAdmin)
  }

  async skipTrack(_roomId: string, trackId: string): Promise<void> {
    const np = this.room.queue[0]
    if (np?.mediaSource.trackId === trackId) {
      this.room.queue.shift()
      const next = this.room.queue[0]
      if (next) {
        await this.lifecycle.emit("TRACK_CHANGED", {
          roomId: this.room.roomId,
          track: next,
        })
      }
      this.room.logEvent("SKIP_TRACK", { trackId })
      this.room.notify()
    }
  }

  async sendSystemMessage(
    roomId: string,
    message: string,
    meta?: ChatMessage["meta"],
    mentions?: ChatMessage["mentions"],
  ): Promise<void> {
    this.room.appendChat(studioSystemMessage(message, meta, mentions))
    await this.lifecycle.emit("MESSAGE_RECEIVED", {
      roomId,
      message: studioSystemMessage(message, meta, mentions),
    })
  }

  async sendUserSystemMessage(
    roomId: string,
    userId: string,
    message: string,
    meta?: ChatMessage["meta"],
  ): Promise<void> {
    const u = this.room.users.get(userId)
    const mentionName = u?.username ?? userId
    const m = studioSystemMessage(message, meta, mentionName ? [mentionName] : undefined)
    this.room.appendChat(m)
    this.room.logEvent("USER_SYSTEM_MESSAGE", { userId, message })
  }

  async sendUserToast(
    _roomId: string,
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
    this.room.logEvent("USER_TOAST", { userId, ...toast })
  }

  async requestGameStateTabAttention(params: {
    userId: string
    tabId: string
  }): Promise<void> {
    this.room.logEvent("PLUGIN_TAB_ATTENTION", params)
  }

  async getPluginConfig(roomId: string, pluginName: string): Promise<unknown | null> {
    if (roomId !== this.room.roomId) return null
    return this.room.getPluginConfig(pluginName)
  }

  async setPluginConfig(roomId: string, pluginName: string, config: unknown): Promise<void> {
    if (roomId !== this.room.roomId) return
    this.room.setPluginConfig(pluginName, config as Record<string, unknown>)
  }

  async updatePlaylistTrack(): Promise<void> {}

  async getQueue(roomId: string): Promise<QueueItem[]> {
    if (roomId !== this.room.roomId) return []
    return [...this.room.queue]
  }

  async addToTrackQueue(
    roomId: string,
    metadataTrackId: string,
    options?: { addedBy?: QueueItemAttribution; runPluginValidation?: boolean },
  ): Promise<{ success: true; queuedItem: QueueItem } | { success: false; message: string }> {
    if (roomId !== this.room.roomId) return { success: false, message: "Wrong room" }
    const base = queueItemFactory.build()
    let addedBy: User | undefined
    if (options?.addedBy?.type === "user") {
      addedBy = {
        userId: options.addedBy.userId,
        username: options.addedBy.username,
      }
    } else if (options?.addedBy?.type === "plugin") {
      addedBy = {
        userId: `plugin:${options.addedBy.pluginName}`,
        username: options.addedBy.displayName ?? options.addedBy.pluginName,
      }
    }
    const queuedItem: QueueItem = {
      ...base,
      title: `Track ${metadataTrackId}`,
      mediaSource: { type: "spotify", trackId: metadataTrackId },
      metadataSource: { type: "spotify", trackId: metadataTrackId },
      track: {
        ...base.track,
        id: metadataTrackId,
        title: `Track ${metadataTrackId}`,
      },
      addedAt: Date.now(),
      addedBy,
    }
    this.room.queue.push(queuedItem)
    await this.lifecycle.emit("PLAYLIST_TRACK_ADDED", { roomId: this.room.roomId, track: queuedItem })
    this.room.logEvent("QUEUE_ADD", { metadataTrackId })
    this.room.notify()
    return { success: true, queuedItem }
  }

  async removeFromTrackQueue(): Promise<{ success: true } | { success: false; message: string }> {
    return { success: false, message: "Not implemented in Game Studio" }
  }

  async moveToTrackQueueTop(): Promise<{ success: true } | { success: false; message: string }> {
    return { success: false, message: "Not implemented in Game Studio" }
  }

  async moveToTrackQueueBottom(): Promise<{ success: true } | { success: false; message: string }> {
    return { success: false, message: "Not implemented in Game Studio" }
  }

  async moveTrackByPosition(
    roomId: string,
    metadataTrackId: string,
    delta: number,
    actorUserId?: string,
  ): Promise<MoveTrackResult> {
    if (roomId !== this.room.roomId)
      return { success: false, reason: "error", message: "Wrong room" }
    const queue = this.room.queue
    const index = queue.findIndex((q) => q.track.id === metadataTrackId)
    if (index === -1)
      return { success: false, reason: "error", message: "Track not found in queue" }

    const queueItem = queue[index]
    if (queueItem) {
      const ownerId = queueItem.addedBy?.userId ?? ""
      const intent = delta > 0 ? ("negative" as const) : ("positive" as const)
      const blocked = checkQueueDefenseStudio(this.room, ownerId, intent)
      if (blocked) {
        const session = this.room.activeSession
        await this.lifecycle.emit("GAME_EFFECT_BLOCKED", {
          roomId: this.room.roomId,
          sessionId: session?.id ?? "",
          targetUserId: ownerId,
          actorUserId,
          blockType: "queue",
          queue: { metadataTrackId, delta, intent },
          blockedBy: {
            itemDefinitionId: blocked.itemDefinitionId,
            itemId: blocked.itemId,
            defenderUserId: blocked.defenderUserId,
            itemName: blocked.itemName,
          },
        })
        const attackerName = actorUserId
          ? (this.room.users.get(actorUserId)?.username?.trim() ?? "Someone")
          : "Someone"
        const targetName = ownerId ? (this.room.users.get(ownerId)?.username?.trim() ?? ownerId) : ownerId
        const actionWord = intent === "negative" ? "demote" : "promote"
        this.room.appendChat(
          studioSystemMessage(
            `${attackerName} tried to ${actionWord} ${targetName}'s queued track, but ${blocked.itemName} blocked it.`,
            { type: "alert", status: "warning", title: "Blocked" },
          ),
        )
        return {
          success: false,
          reason: "defense_blocked",
          blockingItemName: blocked.itemName,
        }
      }
    }

    if (queue.length <= 1) {
      return {
        success: false,
        reason: "error",
        message: "Not enough tracks in the queue to reorder",
      }
    }
    const finalIndex = Math.max(0, Math.min(queue.length - 1, index + delta))
    if (finalIndex === index) {
      return {
        success: false,
        reason: "error",
        message: "Track can't move further in that direction",
      }
    }
    const reordered = [...queue]
    const [target] = reordered.splice(index, 1)
    if (!target)
      return { success: false, reason: "error", message: "Track not found in queue" }
    reordered.splice(finalIndex, 0, target)
    this.room.queue = reordered
    await this.lifecycle.emit("QUEUE_CHANGED", { roomId: this.room.roomId, queue: reordered })
    this.room.logEvent("QUEUE_MOVE", { metadataTrackId, delta })
    this.room.notify()
    return { success: true }
  }

  async shuffleTrackQueue(
    roomId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    if (roomId !== this.room.roomId)
      return { success: false, message: "Wrong room" }

    const queue = this.room.queue
    if (queue.length <= 2) {
      return { success: true }
    }

    const nowPlaying = queue[0]
    if (!nowPlaying) {
      return { success: true }
    }

    const rest = queue.slice(1)
    const shuffledRest = shuffleQueueItems(rest)
    this.room.queue = [nowPlaying, ...shuffledRest]

    await this.lifecycle.emit("QUEUE_CHANGED", {
      roomId: this.room.roomId,
      queue: this.room.queue,
    })
    this.room.logEvent("QUEUE_SHUFFLE", { count: shuffledRest.length })
    this.room.notify()
    return { success: true }
  }

  async setPlaybackVolume(
    _roomId: string,
    _volumePercent: number,
  ): Promise<{ success: true } | { success: false; message: string }> {
    return { success: false, message: "Not implemented in Game Studio" }
  }

  async supportsVolumeControl(_roomId: string): Promise<boolean> {
    return false
  }

  async listMediaBridgeSayVoices(
    _roomId: string,
  ): Promise<{ voices: Array<{ id: string; name: string; locale: string }> }> {
    return {
      voices: [
        { id: "Samantha", name: "Samantha", locale: "en_US" },
        { id: "Zarvox", name: "Zarvox", locale: "en_US" },
        { id: "Whisper", name: "Whisper", locale: "en_US" },
      ],
    }
  }

  async speakOnMediaBridge(
    _roomId: string,
    params: { text: string; voice: string },
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    this.room.logEvent("SPEAK_ON_MEDIA_BRIDGE", params)
    return { ok: true }
  }

  /** Studio stub catalog — not filtered by bridge CAPABILITIES. */
  async listMetadataSources(_roomId: string): Promise<{ id: string; label: string }[]> {
    return ["spotify", "youtube", "local"].map((id) => ({
      id,
      label: labelForMetadataSource(id),
    }))
  }

  /** Studio treats all catalog sources as open for the requested action. */
  async canAccessMetadataSource(params: {
    roomId: string
    userId: string
    sourceId: string
    action: MetadataSourceAccessAction
  }): Promise<boolean> {
    const sources = await this.listMetadataSources(params.roomId)
    return sources.some((s) => s.id === params.sourceId)
  }

  async getEffectiveMetadataSourceIds(
    roomId: string,
    _userId: string,
    _action: MetadataSourceAccessAction,
  ): Promise<string[]> {
    const sources = await this.listMetadataSources(roomId)
    return sources.map((s) => s.id)
  }

  async emit<T extends Record<string, unknown>>(
    eventName: string,
    data: T,
    _options?: { invalidatesUserState?: boolean },
  ): Promise<void> {
    const type = `PLUGIN:${this.pluginName}:${eventName}`
    this.room.logEvent(type, data)
    this.room.notify()
  }

  async emitToUser<T extends Record<string, unknown>>(
    userId: string,
    eventName: string,
    data: T,
  ): Promise<void> {
    this.room.logEvent(`PLUGIN:${this.pluginName}:${eventName}`, { userId, ...data })
    this.room.notify()
  }

  async queueSoundEffect(params: {
    url: string
    volume?: number
    userId?: string
    duck?: boolean
  }): Promise<void> {
    this.room.logEvent("SOUND_EFFECT", params)
  }

  async queueScreenEffect(_params: {
    target: ScreenEffectTarget
    targetId?: string
    effect: ScreenEffectName
    duration?: number
    recipientUserId?: string
  }): Promise<void> {
    this.room.logEvent("SCREEN_EFFECT", _params)
  }

  async checkLocalTrackPlaylistMembership(_params: {
    roomId: string
    trackId: string
    playlistIds?: string[]
    albumIds?: string[]
    includeTrackAlbumId?: boolean
    firstMatch?: boolean
  }): Promise<{ playlistIds: string[]; albumIds: string[] }> {
    return { playlistIds: [], albumIds: [] }
  }

  async listLocalPlaylists(
    _roomId: string,
  ): Promise<Array<{ id: string; name: string; songCount?: number }>> {
    return []
  }

  async getLocalPlaylistArtwork(
    _roomId: string,
    _playlistIds: string[],
  ): Promise<Record<string, LocalPlaylistArtwork>> {
    return {}
  }

  async listLibraryAlbums(_roomId: string): Promise<
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
    return []
  }

  async getLocalAlbumArtwork(
    _roomId: string,
    _albumIds: string[],
  ): Promise<Record<string, LocalPlaylistArtwork>> {
    return {}
  }

  async listLocalAlbumTrackIds(_roomId: string, _albumId: string): Promise<string[]> {
    return []
  }

  async invalidateLocalLibraryCache(_roomId: string): Promise<boolean> {
    return false
  }

  async listLocalPlaylistTracks(
    _roomId: string,
    _playlistId: string,
  ): Promise<import("@repo/types").MetadataSourceTrack[]> {
    return []
  }

  async listLocalPlaylistTrackIds(
    _roomId: string,
    _playlistId: string,
  ): Promise<Array<{ id: string; albumId?: string }>> {
    return []
  }
}
