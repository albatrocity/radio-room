import { AdminService } from "../services/AdminService"
import { HandlerConnections, AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { getRoomPath } from "../lib/getRoomPath"
import { findRoom } from "../operations/data"
import { pubUserKicked, pubRoomSettingsUpdated } from "../operations/sockets/room"

/**
 * Socket.io adapter for the AdminService
 * This layer is thin and just connects Socket.io events to our business logic service
 */
export class AdminHandlers {
  constructor(private adminService: AdminService) {}

  /**
   * Get room settings for an admin
   */
  getRoomSettings = async ({ io, socket }: HandlerConnections) => {
    const result = await this.adminService.getRoomSettings(socket.data.roomId, socket.data.userId)

    if (result.error) {
      socket.emit("event", {
        type: "ERROR",
        data: result.error,
      })
      return
    }

    if (!result.room) {
      return
    }

    // Fetch plugin configs
    const { getPluginConfig } = await import("../operations/data/pluginConfigs")
    const playlistDemocracy = await getPluginConfig({
      context: socket.context,
      roomId: socket.data.roomId,
      pluginName: "playlist-democracy",
    })

    console.log("[AdminHandler] Sending ROOM_SETTINGS with playlistDemocracy:", playlistDemocracy)

    io.to(socket.id).emit("event", {
      type: "ROOM_SETTINGS",
      data: {
        room: result.room,
        playlistDemocracy,
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
    const result = await this.adminService.kickUser(user)

    if (result.socketId) {
      io.to(result.socketId).emit("event", { type: "NEW_MESSAGE", data: result.message })
      io.to(result.socketId).emit("event", { type: "KICKED" })

      if (io.sockets.sockets.get(result.socketId)) {
        io.sockets.sockets.get(result.socketId)?.disconnect()
      }
    }
  }

  /**
   * Update room settings
   */
  setRoomSettings = async ({ socket, io }: HandlerConnections, values: Partial<Room>) => {
    // Get current room state for plugin sync (before any updates)
    const { findRoom } = await import("../operations/data")
    const previousRoom = await findRoom({ context: socket.context, roomId: socket.data.roomId })

    // Capture previous plugin configs before updating
    const previousPluginConfigs: Record<string, any> = {}
    const pluginConfigs = (values as any).pluginConfigs

    if (pluginConfigs) {
      const { getPluginConfig, setPluginConfig } = await import("../operations/data/pluginConfigs")

      // First, fetch all previous configs
      for (const pluginName of Object.keys(pluginConfigs)) {
        previousPluginConfigs[pluginName] = await getPluginConfig({
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
        type: "ERROR",
        data: result.error,
      })
      return
    }

    if (!result.room) {
      return
    }

    // Fetch updated plugin configs to send back to client
    const { getPluginConfig } = await import("../operations/data/pluginConfigs")
    const updatedPlaylistDemocracy = await getPluginConfig({
      context: socket.context,
      roomId: socket.data.roomId,
      pluginName: "playlist-democracy",
    })

    io.to(getRoomPath(socket.data.roomId)).emit("event", {
      type: "ROOM_SETTINGS",
      data: {
        room: result.room,
        playlistDemocracy: updatedPlaylistDemocracy,
      },
    })

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

        // Now emit configChanged events after plugins are initialized
        for (const [pluginName, newConfig] of Object.entries(pluginConfigs)) {
          const previousConfig = previousPluginConfigs[pluginName]

          console.log(`[AdminHandler] Emitting configChanged for ${pluginName}:`, {
            previous: previousConfig,
            current: newConfig,
            changed: JSON.stringify(newConfig) !== JSON.stringify(previousConfig),
          })

          // Only emit if config actually changed
          if (JSON.stringify(newConfig) !== JSON.stringify(previousConfig)) {
            if (socket.context.systemEvents) {
              await socket.context.systemEvents.emit(socket.data.roomId, "configChanged", {
                roomId: socket.data.roomId,
                config: newConfig,
                previousConfig,
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
   * Clear a room's playlist
   */
  clearPlaylist = async ({ socket, io }: HandlerConnections) => {
    const result = await this.adminService.clearPlaylist(socket.data.roomId, socket.data.userId)

    if (result.error) {
      socket.emit("event", {
        type: "ERROR",
        data: result.error,
      })
      return
    }

    if (!result.success) {
      return
    }

    io.to(getRoomPath(socket.data.roomId)).emit("event", {
      type: "PLAYLIST",
      data: [],
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
