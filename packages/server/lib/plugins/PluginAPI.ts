import {
  AppContext,
  PluginAPI,
  Reaction,
  User,
  ReactionSubject,
  ChatMessage,
  ScreenEffectTarget,
  ScreenEffectName,
  isChatMessageTransformDrop,
  type Emoji,
  type PluginCapabilityName,
  type CapabilityMethodName,
  type CapabilityMethodArgs,
  type CapabilityMethodReturn,
  type CapabilityRequestResult,
} from "@repo/types"
import { Server } from "socket.io"
import { getRoomPath } from "../getRoomPath"
import type { PluginCapabilityHost } from "./PluginCapability"

/**
 * Residual plugin host: chat, presence, effects, config, and emit.
 * Domain capabilities are separate objects that share this instance's scope (ADR 0201).
 */
export class PluginAPIImpl implements PluginAPI, PluginCapabilityHost {
  pluginName: string | null = null
  roomId: string | null = null
  private contributesUserGameState = false
  /** Rooms that already queued USER_GAME_STATE_INVALIDATED this event-loop turn. */
  private static invalidationPending = new Set<string>()

  constructor(
    readonly context: AppContext,
    readonly io: Server,
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
  ): PluginAPIImpl {
    const scoped = new PluginAPIImpl(this.context, this.io)
    scoped.setPluginContext(pluginName, roomId, options)
    return scoped
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

  async spawnEphemeralUser(
    roomId: string,
    params: { username: string; userId?: string },
  ): Promise<User> {
    const { addOnlineUser, saveUser, getRoomUsers, getUser } = await import("../../operations/data")
    const generateId = (await import("../../lib/generateId")).default

    const userId = params.userId ?? generateId()
    const newUser: User = {
      userId,
      username: params.username,
      isDj: false,
      isDeputyDj: false,
      isAdmin: false,
      status: "participating",
      connectedAt: new Date().toISOString(),
    }

    await addOnlineUser({ context: this.context, roomId, userId })
    await saveUser({ context: this.context, userId, attributes: newUser })

    const users = await getRoomUsers({ context: this.context, roomId })
    const user =
      users.find((u) => u.userId === userId) ??
      (await getUser({ context: this.context, userId })) ??
      newUser

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "USER_JOINED", {
        roomId,
        user,
        users,
      })
    }

    return user
  }

  async despawnEphemeralUser(roomId: string, userId: string): Promise<void> {
    const { removeOnlineUser, deleteUser, getUser, getRoomUsers } = await import(
      "../../operations/data"
    )

    const user = (await getUser({ context: this.context, userId })) ?? {
      userId,
      username: userId,
    }

    await removeOnlineUser({ context: this.context, roomId, userId })
    await deleteUser({ context: this.context, userId })

    if (this.context.systemEvents) {
      const users = await getRoomUsers({ context: this.context, roomId })
      await this.context.systemEvents.emit(roomId, "USER_LEFT", {
        roomId,
        user,
        users,
      })
    }
  }

  async sendChatMessageAsUser(roomId: string, userId: string, content: string): Promise<void> {
    const { getUser } = await import("../../operations/data")
    const { MessageService } = await import("../../services/MessageService")
    const { default: sendMessage } = await import("../../lib/sendMessage")

    const stored = await getUser({ context: this.context, userId })
    const username = stored?.username ?? userId
    const messageService = new MessageService(this.context)
    const result = await messageService.processNewMessage(roomId, userId, username, content)

    if (this.context.systemEvents) {
      await this.context.systemEvents.emit(roomId, "CHAT_MESSAGE_SUBMITTED", {
        roomId,
        userId,
        username,
        content,
      })
    }

    const registry = this.context.pluginRegistry
    const transformResult = registry
      ? await registry.transformChatMessage(roomId, result.message)
      : result.message

    if (isChatMessageTransformDrop(transformResult)) {
      return
    }

    await sendMessage(this.io, roomId, transformResult, this.context)
  }

  async addReactionAsUser(
    roomId: string,
    userId: string,
    emoji: Emoji,
    reactTo: ReactionSubject,
  ): Promise<void> {
    const { getUser } = await import("../../operations/data")
    const { addReaction } = await import("../../operations/reactions")
    const stored = await getUser({ context: this.context, userId })
    const user: User = stored ?? { userId, username: userId }
    await addReaction({
      context: this.context,
      roomId,
      reaction: { emoji, reactTo, user },
    })
  }

  async removeReactionAsUser(
    roomId: string,
    userId: string,
    emoji: Emoji,
    reactTo: ReactionSubject,
  ): Promise<void> {
    const { getUser } = await import("../../operations/data")
    const { removeReaction } = await import("../../operations/reactions")
    const stored = await getUser({ context: this.context, userId })
    const user: User = stored ?? { userId, username: userId }
    await removeReaction({
      context: this.context,
      roomId,
      emoji,
      reactTo,
      user,
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

  async requestCapability<C extends PluginCapabilityName, M extends CapabilityMethodName<C>>(
    roomId: string,
    capability: C,
    method: M,
    ...args: CapabilityMethodArgs<C, M>
  ): Promise<CapabilityRequestResult<CapabilityMethodReturn<C, M>>> {
    const registry = this.context.pluginRegistry
    if (!registry) return { ok: false, reason: "unsupported" }
    const result = await registry.requestCapability(roomId, capability, String(method), args)
    return result as CapabilityRequestResult<CapabilityMethodReturn<C, M>>
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

  /**
   * Targeted plugin event (same `PLUGIN:{name}:{event}` namespace as {@link emit}).
   * Does not invalidate user game state — callers that change contributed bags
   * should either include the bag in the payload or invalidate explicitly.
   */
  async emitToUser<T extends Record<string, unknown>>(
    userId: string,
    eventName: string,
    data: T,
  ): Promise<void> {
    if (!this.pluginName || !this.roomId) {
      console.warn("[PluginAPI] Cannot emitToUser: plugin context not set")
      return
    }

    const { emitToUserSocket } = await import("../../lib/emitToUserSocket")
    const namespacedEvent = `PLUGIN:${this.pluginName}:${eventName}`
    const payload = {
      roomId: this.roomId,
      ...data,
    }

    await emitToUserSocket({
      io: this.io,
      context: this.context,
      roomId: this.roomId,
      userId,
      type: namespacedEvent,
      data: payload,
    })
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

  async requestGameStateTabAttention(params: { userId: string; tabId: string }): Promise<void> {
    if (!this.pluginName || !this.roomId) {
      console.warn("[PluginAPI] Cannot request tab attention: plugin context not set")
      return
    }

    // Client game-state tabs are keyed as `${pluginName}:${schemaTabId}`
    // (see useGameStatePluginTabEntries). Accept bare schema ids from plugins.
    const tabId = params.tabId.includes(":") ? params.tabId : `${this.pluginName}:${params.tabId}`

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
   * to emit only to that user's socket (ADR 0072). Set `duck: true` to duck
   * in-browser programme while the clip plays (ADR 0174).
   */
  async queueSoundEffect(params: {
    url: string
    volume?: number
    userId?: string
    duck?: boolean
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
      ...(params.duck === true ? { duck: true as const } : {}),
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
      ...(params.recipientUserId !== undefined ? { recipientUserId: params.recipientUserId } : {}),
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
