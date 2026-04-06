import { omit } from "remeda"
import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"
import type { SegmentDTO, SegmentRoomSettingsOverride } from "@repo/types"
import { validatePreset } from "@repo/utils"
import * as scheduling from "../services/SchedulingService"
import systemMessage from "../lib/systemMessage"
import { findRoom, saveRoom, isAdminMember } from "./data"
import { persistMessage } from "./data/messages"
import {
  getPluginConfig,
  setPluginConfig,
  deleteAllPluginConfigs,
  getAllPluginConfigs,
} from "./data/pluginConfigs"
import {
  applyFetchMetaTransitionEffects,
  enterStreamingMode,
} from "./room/applyFetchMetaTransitionEffects"
import { isStreamingMode } from "../lib/streamingMode"
import { applySegmentDeputyBulkAction } from "./room/applySegmentDeputyBulkAction"

export type PresetApplyMode = "merge" | "replace" | "skip"

function patchRoomFromSegmentOverride(override: SegmentRoomSettingsOverride | null | undefined): Partial<Room> {
  if (!override) return {}
  const p: Partial<Room> = {}
  if (override.deputizeOnJoin !== undefined) p.deputizeOnJoin = override.deputizeOnJoin
  if (override.showQueueCount !== undefined) p.showQueueCount = override.showQueueCount
  if (override.showQueueTracks !== undefined) p.showQueueTracks = override.showQueueTracks
  if (override.fetchMeta !== undefined) p.fetchMeta = override.fetchMeta
  return p
}

type ErrorBody = { status: number; error: string; message: string }

export async function activateRoomSegment(params: {
  context: AppContext
  roomId: string
  userId: string
  segmentId: string
  presetMode: PresetApplyMode
}): Promise<{ ok: true; room: Room } | { ok: false; error: ErrorBody }> {
  const { context, roomId, userId, segmentId, presetMode } = params

  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Room not found." } }
  }

  const isCreator = userId === room.creator
  const isDesignatedAdmin = await isAdminMember({ context, roomId, userId })
  if (!isCreator && !isDesignatedAdmin) {
    return {
      ok: false,
      error: { status: 403, error: "Forbidden", message: "You are not a room admin." },
    }
  }

  if (!room.showId) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "Bad Request",
        message: "This room has no show attached.",
      },
    }
  }

  const show = await scheduling.findShowById(room.showId)
  if (!show) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Show not found." } }
  }

  const showRow = show.segments?.find((s) => s.segmentId === segmentId)
  if (!showRow) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "Bad Request",
        message: "Segment is not part of this room’s attached show.",
      },
    }
  }

  const segment = showRow.segment as SegmentDTO
  const preset = segment.pluginPreset

  if (presetMode !== "skip" && preset) {
    const v = validatePreset(preset)
    if (!v.valid) {
      return {
        ok: false,
        error: {
          status: 400,
          error: "Bad Request",
          message: v.error ?? "Invalid plugin preset on segment.",
        },
      }
    }
  }

  const previousRoom = room
  const base = omit(room, ["spotifyError", "radioError"] as const)
  const overridePatch = patchRoomFromSegmentOverride(segment.roomSettingsOverride)
  const mergedRoom: Room = { ...base, ...overridePatch, activeSegmentId: segmentId }

  await saveRoom({
    context,
    room: mergedRoom,
  })

  if (previousRoom.fetchMeta !== mergedRoom.fetchMeta) {
    await applyFetchMetaTransitionEffects({
      context,
      roomId,
      previousFetchMeta: previousRoom.fetchMeta,
      newFetchMeta: mergedRoom.fetchMeta,
    })
  } else if (isStreamingMode(mergedRoom) && previousRoom.activeSegmentId !== segmentId) {
    await enterStreamingMode(context, roomId)
  }

  await applySegmentDeputyBulkAction({
    context,
    roomId,
    action: segment.roomSettingsOverride?.deputyBulkAction,
  })

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "SEGMENT_ACTIVATED", {
      roomId,
      showId: room.showId,
      segmentId,
      segmentTitle: segment.title,
    })
  }

  if (room.announceActiveSegment !== false) {
    const message = systemMessage(`Active segment: ${segment.title}`, {
      status: "info",
      type: "alert",
      title: "Schedule",
    })
    if (context.systemEvents) {
      await context.systemEvents.emit(roomId, "MESSAGE_RECEIVED", {
        roomId,
        message,
      })
    }
    await persistMessage({ roomId, message, context })
  }

  let pluginsTouched = false
  const previousPluginConfigs: Record<string, unknown> = {}

  if (presetMode !== "skip" && preset) {
    pluginsTouched = true

    if (presetMode === "replace") {
      await deleteAllPluginConfigs({ context, roomId })
    }

    const pluginNames = Object.keys(preset.pluginConfigs)
    for (const pluginName of pluginNames) {
      previousPluginConfigs[pluginName] = await getPluginConfig({
        context,
        roomId,
        pluginName,
      })
    }

    for (const [pluginName, config] of Object.entries(preset.pluginConfigs)) {
      await setPluginConfig({
        context,
        roomId,
        pluginName,
        config,
      })
    }
  }

  const updatedRoom = (await findRoom({ context, roomId }))!
  const updatedPluginConfigs = await getAllPluginConfigs({ context, roomId })

  if (pluginsTouched && preset && context.pluginRegistry) {
    try {
      await context.pluginRegistry.syncRoomPlugins(roomId, updatedRoom, previousRoom)
      for (const [pluginName, newConfig] of Object.entries(preset.pluginConfigs)) {
        const previousConfig = previousPluginConfigs[pluginName]
        if (JSON.stringify(newConfig) !== JSON.stringify(previousConfig) && context.systemEvents) {
          await context.systemEvents.emit(roomId, "CONFIG_CHANGED", {
            roomId,
            pluginName,
            config: newConfig as Record<string, unknown>,
            previousConfig: (previousConfig ?? {}) as Record<string, unknown>,
          })
        }
      }
    } catch (e) {
      console.error("[activateRoomSegment] plugin sync failed:", e)
    }
  } else if (context.pluginRegistry) {
    try {
      await context.pluginRegistry.syncRoomPlugins(roomId, updatedRoom, previousRoom)
    } catch (e) {
      console.error("[activateRoomSegment] plugin sync failed:", e)
    }
  }

  if (context.systemEvents) {
    await context.systemEvents.emit(roomId, "ROOM_SETTINGS_UPDATED", {
      roomId,
      room: updatedRoom,
      pluginConfigs: updatedPluginConfigs,
    })
  }

  return { ok: true, room: updatedRoom }
}
