import { omit } from "remeda"
import type { AppContext } from "@repo/types"
import type { Room } from "@repo/types/Room"
import type { SegmentDTO, SegmentRoomSettingsOverride } from "@repo/types"
import { validatePreset } from "@repo/utils"
import * as scheduling from "../services/SchedulingService"
import systemMessage from "../lib/systemMessage"
import { findRoom, saveRoom, isRoomAdmin } from "./data"
import { persistMessage } from "./data/messages"
import {
  getPluginConfig,
  setPluginConfig,
  setPluginPrivateConfig,
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
  if (override.queueAutoAdvance !== undefined) p.queueAutoAdvance = override.queueAutoAdvance
  if (override.fetchMeta !== undefined) p.fetchMeta = override.fetchMeta
  if (override.announceNowPlaying !== undefined) p.announceNowPlaying = override.announceNowPlaying
  if (override.playbackMode !== undefined) p.playbackMode = override.playbackMode
  return p
}

type ErrorBody = { status: number; error: string; message: string }

export async function activateRoomSegment(params: {
  context: AppContext
  roomId: string
  userId: string
  segmentId: string
  showSegmentId?: string | null
  presetMode: PresetApplyMode
}): Promise<
  | { ok: true; room: Room; segmentTitle: string; showSegmentId: string }
  | { ok: false; error: ErrorBody }
> {
  const { context, roomId, userId, segmentId, showSegmentId, presetMode } = params

  const room = await findRoom({ context, roomId })
  if (!room) {
    return { ok: false, error: { status: 404, error: "Not Found", message: "Room not found." } }
  }

  const isAdmin = await isRoomAdmin({ context, roomId, userId, roomCreator: room.creator })
  if (!isAdmin) {
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

  const showSegments = show.segments ?? []
  const showRow = showSegmentId
    ? showSegments.find((s) => s.id === showSegmentId)
    : showSegments.find((s) => s.segmentId === segmentId)
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

  if (showSegmentId && showRow.segmentId !== segmentId) {
    return {
      ok: false,
      error: {
        status: 400,
        error: "Bad Request",
        message: "Segment placement does not match the requested segment.",
      },
    }
  }

  const resolvedSegmentId = showRow.segmentId
  const resolvedShowSegmentId = showRow.id

  const segment = showRow.segment as SegmentDTO
  const preset = segment.pluginPreset
  const gamePreset = segment.gameSessionPreset

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
  const mergedRoom: Room = {
    ...base,
    ...overridePatch,
    activeSegmentId: resolvedSegmentId,
    activeShowSegmentId: resolvedShowSegmentId,
  }

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
  } else if (
    isStreamingMode(mergedRoom) &&
    (previousRoom.activeShowSegmentId !== resolvedShowSegmentId ||
      previousRoom.activeSegmentId !== resolvedSegmentId)
  ) {
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
      segmentId: resolvedSegmentId,
      segmentTitle: segment.title,
    })
  }

  if (room.announceActiveSegment === true) {
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

  // Fan out server-only private plugin content to the room `:private` key
  // (ADR 0068 §5). Written before CONFIG_CHANGED so a plugin that self-starts on
  // config change (e.g. quiz-sessions reading its question bank) sees the merged
  // public + private config. Never placed on any broadcast surface; invalid
  // entries are skipped-and-logged rather than aborting a live show.
  const privateContent = segment.privatePluginContent ?? null
  const privatePluginNames: string[] = []
  if (presetMode !== "skip" && privateContent && typeof privateContent === "object") {
    for (const [pluginName, fields] of Object.entries(privateContent)) {
      if (!fields || typeof fields !== "object") {
        console.warn(`[activateRoomSegment] skipping invalid private content for ${pluginName}`)
        continue
      }
      try {
        await setPluginPrivateConfig({
          context,
          roomId,
          pluginName,
          config: fields as Record<string, unknown>,
        })
        privatePluginNames.push(pluginName)
        pluginsTouched = true
      } catch (e) {
        console.error(`[activateRoomSegment] failed to apply private content for ${pluginName}:`, e)
      }
    }
  }

  const updatedRoom = (await findRoom({ context, roomId }))!
  const updatedPluginConfigs = await getAllPluginConfigs({ context, roomId })

  if (pluginsTouched && context.pluginRegistry) {
    try {
      await context.pluginRegistry.syncRoomPlugins(roomId, updatedRoom, previousRoom)

      // Notify plugins whose config changed so they can react (e.g. quiz
      // self-start). Union of preset plugins whose PUBLIC config changed and
      // plugins that received private content this activation. The payload
      // carries only the public view; plugins re-read merged config via
      // getConfig(), so private fields are never broadcast in CONFIG_CHANGED.
      const changedPlugins: string[] = [...privatePluginNames]
      if (preset) {
        for (const [pluginName, newConfig] of Object.entries(preset.pluginConfigs)) {
          const previousConfig = previousPluginConfigs[pluginName]
          if (
            JSON.stringify(newConfig) !== JSON.stringify(previousConfig) &&
            !changedPlugins.includes(pluginName)
          ) {
            changedPlugins.push(pluginName)
          }
        }
      }
      if (context.systemEvents) {
        for (const pluginName of changedPlugins) {
          const newConfig = (preset?.pluginConfigs[pluginName] ??
            updatedPluginConfigs[pluginName] ??
            {}) as Record<string, unknown>
          const previousConfig = (previousPluginConfigs[pluginName] ?? {}) as Record<string, unknown>
          await context.systemEvents.emit(roomId, "CONFIG_CHANGED", {
            roomId,
            pluginName,
            config: newConfig,
            previousConfig,
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

  // ---------------------------------------------------------------------------
  // Game session integration
  //
  // If the segment defines a `gameSessionPreset`, activating it auto-ends any
  // currently-active session (whose lifetime is implicitly bound to the
  // previous segment) and starts a new one tagged with this segment id.
  //
  // If the segment has no preset, we still end the previous session so games
  // don't bleed across segments.
  // ---------------------------------------------------------------------------
  const gameSessions = context.gameSessions as
    | { startSession: (...args: any[]) => Promise<any>; endSession: (roomId: string) => Promise<any> }
    | undefined

  if (gameSessions) {
    try {
      // Always end the previous session — the previous segment "owned" it.
      await gameSessions.endSession(roomId)

      if (presetMode !== "skip" && gamePreset) {
        await gameSessions.startSession(roomId, { ...gamePreset, segmentId: resolvedSegmentId })
      }
    } catch (e) {
      console.error("[activateRoomSegment] game session sync failed:", e)
    }
  }

  return { ok: true, room: updatedRoom, segmentTitle: segment.title, showSegmentId: resolvedShowSegmentId }
}
