import { AdminService } from "../services/AdminService"
import { activateRoomSegment, type PresetApplyMode } from "../operations/activateRoomSegment"
import { injectSegmentTracksToQueue } from "../operations/injectSegmentTracksToQueue"
import * as scheduling from "../services/SchedulingService"
import { isAppControlledPlayback } from "../lib/roomTypeHelpers"
import { HandlerConnections, AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { pubUserJoined } from "../operations/sockets/users"
import { getRoomUsers, removeOnlineUser, buildQueueChangedData, findRoom } from "../operations/data"

/**
 * Socket.io adapter for the AdminService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class AdminHandlers {
  constructor(private readonly adminService: AdminService) {}

  /**
   * Get room settings for an admin
   */
  getRoomSettings = async ({ io, socket }: HandlerConnections) => {
    const result = await this.adminService.getRoomSettings(socket.data.roomId, socket.data.userId)

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    if (!result.room) {
      return
    }

    // Admin-gated pull (ADR 0068 §2): this handler is guarded by
    // adminService.getRoomSettings and emits only to the requesting socket, so
    // it is safe to return MERGED configs (public + server-only private fields)
    // here. This primes the admin editor with existing private values (e.g.
    // quiz accepted answers). Room-wide pushes still use getAllPluginConfigs.
    const { getAllMergedPluginConfigs } = await import("../operations/data/pluginConfigs")
    const pluginConfigs = await getAllMergedPluginConfigs({
      context: socket.context,
      roomId: socket.data.roomId,
    })

    io.to(socket.id).emit("event", {
      type: "ROOM_SETTINGS",
      data: {
        room: result.room,
        pluginConfigs,
      },
    })
  }

  /**
   * Set a room password
   */
  setPassword = async ({ socket }: HandlerConnections, value: string) => {
    await this.adminService.setPassword(socket.data.roomId, value)
  }

  /**
   * Kick a user from a room
   */
  kickUser = async ({ io, socket }: HandlerConnections, user: User) => {
    const result = await this.adminService.kickUser(socket.data.roomId, user)

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    const liveSocket = result.socketId ? io.sockets.sockets.get(result.socketId) : null

    if (result.socketId && liveSocket) {
      // Send message notification to the kicked user (direct message to specific socket)
      io.to(result.socketId).emit("event", {
        type: "MESSAGE_RECEIVED",
        data: {
          roomId: socket.data.roomId,
          message: result.message,
        },
      })

      // Send USER_KICKED directly to the kicked user's socket (NOT broadcast to room)
      // This prevents other users (including admin) from receiving the kick event
      io.to(result.socketId).emit("event", {
        type: "USER_KICKED",
        data: {
          roomId: socket.data.roomId,
          user,
          reason: result.message?.content || "Kicked from room",
        },
      })

      // Emit to plugins only (not Socket.IO broadcast) so plugins can handle USER_KICKED
      if (socket.context.pluginRegistry) {
        await socket.context.pluginRegistry.emit(socket.data.roomId, "USER_KICKED", {
          roomId: socket.data.roomId,
          user,
          reason: result.message?.content || "Kicked from room",
        })
      }

      // Disconnect triggers the auth disconnect handler which removes the user
      // from `online_users` and broadcasts `USER_LEFT`.
      liveSocket.disconnect()
    } else {
      // Phantom user cleanup: no live socket exists (either because the kicked
      // user already left or because they are a duplicate-LOGIN phantom whose
      // original socket has already disconnected). Manually remove them from
      // Redis and broadcast USER_LEFT so the listener list updates.
      await removeOnlineUser({
        context: socket.context,
        roomId: socket.data.roomId,
        userId: user.userId,
      })

      if (socket.context.systemEvents) {
        const users = await getRoomUsers({
          context: socket.context,
          roomId: socket.data.roomId,
        })
        await socket.context.systemEvents.emit(socket.data.roomId, "USER_LEFT", {
          roomId: socket.data.roomId,
          user,
          users,
        })
      }
    }
  }

  /**
   * Activate a segment on the room’s attached show (admin only).
   */
  activateSegment = async (
    { socket }: HandlerConnections,
    data: { segmentId: string; showSegmentId?: string; presetMode: PresetApplyMode },
  ) => {
    const result = await activateRoomSegment({
      context: socket.context,
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      segmentId: data.segmentId,
      showSegmentId: data.showSegmentId,
      presetMode: data.presetMode,
    })

    if (!result.ok) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    const showSegmentId = result.showSegmentId ?? result.room.activeShowSegmentId
    if (showSegmentId) {
      const tracks = await scheduling.findShowSegmentTracks(showSegmentId)
      if (tracks.length > 0) {
        socket.emit("event", {
          type: "SEGMENT_TRACKS_AVAILABLE",
          data: {
            showSegmentId,
            segmentTitle: result.segmentTitle,
            count: tracks.length,
            allowTop: isAppControlledPlayback(result.room),
          },
        })
      }
    }
  }

  /**
   * Inject scheduler-curated segment tracks into the room queue (admin only).
   */
  injectSegmentTracks = async (
    { socket }: HandlerConnections,
    data: { showSegmentId: string; placement: "top" | "bottom" },
  ) => {
    const room = await (await import("../operations/data")).findRoom({
      context: socket.context,
      roomId: socket.data.roomId,
    })
    if (!room?.showId) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 400,
          error: "Bad Request",
          message: "This room has no show attached.",
        },
      })
      return
    }

    const show = await scheduling.findShowById(room.showId)
    const placementRow = show?.segments?.find((s) => s.id === data.showSegmentId)
    if (!placementRow) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 400,
          error: "Bad Request",
          message: "Segment placement not found on this show.",
        },
      })
      return
    }

    const result = await injectSegmentTracksToQueue({
      context: socket.context,
      roomId: socket.data.roomId,
      userId: socket.data.userId,
      showSegmentId: data.showSegmentId,
      placement: data.placement,
      segmentTitle: placementRow.segment.title,
    })

    if (!result.ok) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    socket.emit("event", {
      type: "SEGMENT_TRACKS_INJECTED",
      data: {
        showSegmentId: data.showSegmentId,
        added: result.added,
        skipped: result.skipped,
      },
    })
  }

  /**
   * Update room settings
   */
  setRoomSettings = async ({ socket, io }: HandlerConnections, values: Partial<Room>) => {
    // Get current room state for plugin sync (before any updates)
    const { findRoom } = await import("../operations/data")
    const previousRoom = await findRoom({ context: socket.context, roomId: socket.data.roomId })

    // Capture previous plugin configs before updating.
    // - `previousPublicConfigs`: broadcast-safe view, used for CONFIG_CHANGED payloads.
    // - `previousMergedConfigs`: public + private, used only for server-side change
    //   detection so a private-only change still notifies plugins (ADR 0068).
    const previousPublicConfigs: Record<string, any> = {}
    const previousMergedConfigs: Record<string, any> = {}
    const pluginConfigs = (values as any).pluginConfigs

    if (pluginConfigs) {
      const { getPluginConfig, getMergedPluginConfig, setPluginConfig } = await import(
        "../operations/data/pluginConfigs"
      )

      // First, fetch all previous configs
      for (const pluginName of Object.keys(pluginConfigs)) {
        previousPublicConfigs[pluginName] = await getPluginConfig({
          context: socket.context,
          roomId: socket.data.roomId,
          pluginName,
        })
        previousMergedConfigs[pluginName] = await getMergedPluginConfig({
          context: socket.context,
          roomId: socket.data.roomId,
          pluginName,
        })
      }

      // Then update them
      for (const [pluginName, config] of Object.entries(pluginConfigs)) {
        await setPluginConfig({
          context: socket.context,
          roomId: socket.data.roomId,
          pluginName,
          config,
        })
      }

      // Remove pluginConfigs from values so it doesn't get saved to room
      delete (values as any).pluginConfigs
    }

    const result = await this.adminService.setRoomSettings(
      socket.data.roomId,
      socket.data.userId,
      values,
    )

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    if (!result.room) {
      return
    }

    // Fetch updated plugin configs to send back to client
    const { getAllPluginConfigs } = await import("../operations/data/pluginConfigs")
    const updatedPluginConfigs = await getAllPluginConfigs({
      context: socket.context,
      roomId: socket.data.roomId,
    })

    // Emit via SystemEvents so broadcasters receive ROOM_SETTINGS_UPDATED
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(socket.data.roomId, "ROOM_SETTINGS_UPDATED", {
        roomId: socket.data.roomId,
        room: result.room,
        pluginConfigs: updatedPluginConfigs,
      })
    }

    // Re-prime the requesting admin's editor with the MERGED config (public +
    // private) via the same admin-gated, per-socket pull as GET_ROOM_SETTINGS.
    // The room-wide ROOM_SETTINGS_UPDATED above carries public fields only, so
    // without this the admin's just-saved private values (e.g. quiz questions)
    // would appear stale until they reopen settings (ADR 0068 §2).
    if (pluginConfigs) {
      const { getAllMergedPluginConfigs } = await import("../operations/data/pluginConfigs")
      const mergedPluginConfigs = await getAllMergedPluginConfigs({
        context: socket.context,
        roomId: socket.data.roomId,
      })
      io.to(socket.id).emit("event", {
        type: "ROOM_SETTINGS",
        data: {
          room: result.room,
          pluginConfigs: mergedPluginConfigs,
        },
      })
    }

    // Emit configChanged events for updated plugin configs
    if (socket.context.pluginRegistry && result.room && pluginConfigs) {
      try {
        console.log("[AdminHandler] Processing plugin config updates:", {
          roomId: socket.data.roomId,
          pluginNames: Object.keys(pluginConfigs),
          hasRegistry: !!socket.context.pluginRegistry,
        })

        // First, sync plugins (this will initialize any newly enabled plugins)
        console.log("[AdminHandler] Calling syncRoomPlugins...")
        await socket.context.pluginRegistry.syncRoomPlugins(
          socket.data.roomId,
          result.room,
          previousRoom || undefined,
        )
        console.log("[AdminHandler] syncRoomPlugins completed")

        // Now emit configChanged events after plugins are initialized.
        // CONFIG_CHANGED is broadcast to room clients by RoomBroadcaster, so its
        // payload MUST carry only public fields. Change detection uses the merged
        // (public + private) config so private-only edits still notify plugins,
        // which read their full config server-side via getConfig() (ADR 0068).
        const { getMergedPluginConfig } = await import("../operations/data/pluginConfigs")
        for (const pluginName of Object.keys(pluginConfigs)) {
          const previousMerged = previousMergedConfigs[pluginName]
          const newMerged = await getMergedPluginConfig({
            context: socket.context,
            roomId: socket.data.roomId,
            pluginName,
          })

          // Only emit if config actually changed (including private fields)
          if (JSON.stringify(newMerged) !== JSON.stringify(previousMerged)) {
            console.log(`[AdminHandler] Emitting CONFIG_CHANGED for ${pluginName}`)

            if (socket.context.systemEvents) {
              await socket.context.systemEvents.emit(socket.data.roomId, "CONFIG_CHANGED", {
                roomId: socket.data.roomId,
                pluginName,
                // Public-only payload (broadcast-safe).
                config: (updatedPluginConfigs[pluginName] ?? {}) as Record<string, unknown>,
                previousConfig: previousPublicConfigs[pluginName] as Record<string, unknown>,
              })
            }
          }
        }

        // roomSettingsUpdated is emitted by pubRoomSettingsUpdated() below
      } catch (error) {
        console.error("[Plugins] Error syncing plugins after settings update:", error)
      }
    } else if (socket.context.pluginRegistry && result.room) {
      // No plugin configs updated, just sync normally
      try {
        await socket.context.pluginRegistry.syncRoomPlugins(
          socket.data.roomId,
          result.room,
          previousRoom || undefined,
        )

        // roomSettingsUpdated is emitted by pubRoomSettingsUpdated() below
      } catch (error) {
        console.error("[Plugins] Error syncing plugins after settings update:", error)
      }
    }
  }

  /**
   * Toggle an admin-assignable persona for a user (admin-only)
   */
  togglePersona = async (
    { io, socket }: HandlerConnections,
    { userId, personaId }: { userId: User["userId"]; personaId: string },
  ) => {
    const { context } = socket

    const result = await this.adminService.togglePersona(
      socket.data.roomId,
      socket.data.userId,
      userId,
      personaId,
    )

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    if (result.user) {
      pubUserJoined({
        io,
        roomId: socket.data.roomId,
        data: { user: result.user, users: result.users },
        context,
      })
    }
  }

  /**
   * Designate or remove a user as room admin (creator-only)
   */
  designateAdmin = async ({ io, socket }: HandlerConnections, userId: User["userId"]) => {
    const { context } = socket

    const result = await this.adminService.designateAdmin(
      socket.data.roomId,
      socket.data.userId,
      userId,
    )

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    if (result.socketId) {
      io.to(result.socketId).emit("event", {
        type: "MESSAGE_RECEIVED",
        data: {
          roomId: socket.data.roomId,
          message: result.message,
        },
      })

      io.to(result.socketId).emit("event", { type: result.eventType })
    }

    if (result.user) {
      pubUserJoined({
        io,
        roomId: socket.data.roomId,
        data: { user: result.user, users: result.users },
        context,
      })
    }
  }

  /**
   * Clear a room's playlist
   */
  clearPlaylist = async ({ socket, io }: HandlerConnections) => {
    const result = await this.adminService.clearPlaylist(socket.data.roomId, socket.data.userId)

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    if (!result.success) {
      return
    }

    // Emit via SystemEvents so broadcasters receive QUEUE_CHANGED
    if (socket.context.systemEvents) {
      const room = await findRoom({ context: socket.context, roomId: socket.data.roomId })
      const payload = await buildQueueChangedData({
        roomId: socket.data.roomId,
        context: socket.context,
        appControlled: isAppControlledPlayback(room),
      })
      await socket.context.systemEvents.emit(socket.data.roomId, "QUEUE_CHANGED", payload)
    }
  }

  /**
   * Delete a single chat message from a room
   */
  deleteMessage = async ({ socket }: HandlerConnections, data: { timestamp: string }) => {
    const result = await this.adminService.deleteMessage(
      socket.data.roomId,
      socket.data.userId,
      data.timestamp,
    )

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    if (!result.success) {
      return
    }

    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(socket.data.roomId, "MESSAGE_DELETED", {
        roomId: socket.data.roomId,
        timestamp: data.timestamp,
      })
    }
  }

  /**
   * Delete a single track from a room's playlist
   */
  deletePlaylistTrack = async ({ socket }: HandlerConnections, data: { playedAt: number }) => {
    const result = await this.adminService.deletePlaylistTrack(
      socket.data.roomId,
      socket.data.userId,
      data.playedAt,
    )

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    if (!result.success) {
      return
    }

    // Emit via SystemEvents so broadcasters receive PLAYLIST_TRACK_DELETED
    if (socket.context.systemEvents) {
      await socket.context.systemEvents.emit(socket.data.roomId, "PLAYLIST_TRACK_DELETED", {
        roomId: socket.data.roomId,
        playedAt: data.playedAt,
      })
    }
  }

  /**
   * Return the active game session for this room (admin only).
   */
  getGameSessionStatus = async ({ socket }: HandlerConnections) => {
    const result = await this.adminService.getGameSessionStatus(socket.data.roomId, socket.data.userId)
    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }
    socket.emit("event", {
      type: "GAME_SESSION_STATUS",
      data: { session: result.session },
    })
  }

  /**
   * Start an ad-hoc game session (admin only). Core emits GAME_SESSION_STARTED.
   */
  startGameSession = async (
    { socket }: HandlerConnections,
    data: { name: string; initialCoins?: number },
  ) => {
    if (!data?.name?.trim()) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: {
          status: 400,
          error: "Bad Request",
          message: "Session name is required.",
        },
      })
      return
    }

    let initialCoins: number | undefined
    if (data.initialCoins != null) {
      const raw = Number(data.initialCoins)
      if (!Number.isFinite(raw) || raw < 0) {
        socket.emit("event", {
          type: "ERROR_OCCURRED",
          data: {
            status: 400,
            error: "Bad Request",
            message: "Starting coin balance must be a non-negative number.",
          },
        })
        return
      }
      initialCoins = Math.floor(raw)
    }

    const result = await this.adminService.startGameSession(socket.data.roomId, socket.data.userId, {
      name: data.name.trim(),
      ...(initialCoins != null ? { initialValues: { coin: initialCoins } } : {}),
    })

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    socket.emit("event", {
      type: "GAME_SESSION_ADMIN_STARTED",
      data: { session: result.session },
    })
  }

  /**
   * End the active game session (admin only). Core emits GAME_SESSION_ENDED.
   */
  endGameSession = async ({ socket }: HandlerConnections) => {
    const result = await this.adminService.endGameSession(socket.data.roomId, socket.data.userId)

    if (result.error) {
      socket.emit("event", {
        type: "ERROR_OCCURRED",
        data: result.error,
      })
      return
    }

    socket.emit("event", {
      type: "GAME_SESSION_ADMIN_ENDED",
      data: { results: result.results },
    })
  }
}

/**
 * Factory function to create Admin handlers
 */
export function createAdminHandlers(context: AppContext) {
  const adminService = new AdminService(context)
  return new AdminHandlers(adminService)
}
