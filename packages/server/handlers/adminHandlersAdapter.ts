import { AdminService } from "../services/AdminService"
import { HandlerConnections, AppContext } from "@repo/types"
import { User } from "@repo/types/User"
import { Room } from "@repo/types/Room"
import { getRoomPath } from "../lib/getRoomPath"

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

    // Fetch all plugin configs
    const { getAllPluginConfigs } = await import("../operations/data/pluginConfigs")
    const pluginConfigs = await getAllPluginConfigs({
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
    const result = await this.adminService.kickUser(user)

    if (result.socketId) {
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

    io.to(getRoomPath(socket.data.roomId)).emit("event", {
      type: "ROOM_SETTINGS_UPDATED",
      data: {
        roomId: socket.data.roomId,
        room: result.room,
        pluginConfigs: updatedPluginConfigs,
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

          // Only emit if config actually changed
          if (JSON.stringify(newConfig) !== JSON.stringify(previousConfig)) {
            console.log(`[AdminHandler] Emitting CONFIG_CHANGED for ${pluginName}`)

            if (socket.context.systemEvents) {
              await socket.context.systemEvents.emit(socket.data.roomId, "CONFIG_CHANGED", {
                roomId: socket.data.roomId,
                pluginName,
                config: newConfig as Record<string, unknown>,
                previousConfig: previousConfig as Record<string, unknown>,
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
        type: "ERROR_OCCURRED",
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
