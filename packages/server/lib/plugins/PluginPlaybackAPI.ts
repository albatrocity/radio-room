import type { PlaybackController, PlaybackPluginAPI, PluginPlaybackReadResult } from "@repo/types"
import type { ObservedPlayback } from "../../operations/plugins/anchoredSchedules"
import { PluginCapability } from "./PluginCapability"

/** Scoped playback transport, volume, and Media Bridge speech (ADR 0201). */
export class PluginPlaybackAPI extends PluginCapability implements PlaybackPluginAPI {
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

  async getPlayback(roomId: string): Promise<PluginPlaybackReadResult> {
    const { readRoomPlayback } = await import("../../operations/playback/readRoomPlayback")
    return readRoomPlayback({ context: this.context, roomId })
  }

  async pausePlayback(
    roomId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const resolved = await this.resolveAppControlledController(roomId)
    if (!resolved.ok) return { success: false, message: resolved.message }
    try {
      await resolved.controller.api.pause()
    } catch (error: unknown) {
      console.error("[PluginAPI] pausePlayback failed:", error)
      return { success: false, message: "Failed to pause playback" }
    }
    await this.afterTransportMutation(roomId, { state: "paused" })
    return { success: true }
  }

  async resumePlayback(
    roomId: string,
  ): Promise<{ success: true } | { success: false; message: string }> {
    const resolved = await this.resolveAppControlledController(roomId)
    if (!resolved.ok) return { success: false, message: resolved.message }
    try {
      await resolved.controller.api.play()
    } catch (error: unknown) {
      console.error("[PluginAPI] resumePlayback failed:", error)
      return { success: false, message: "Failed to resume playback" }
    }
    await this.afterTransportMutation(roomId, { state: "playing" })
    return { success: true }
  }

  async seekPlayback(
    roomId: string,
    positionMs: number,
  ): Promise<{ success: true; positionMs: number } | { success: false; message: string }> {
    if (!Number.isFinite(positionMs) || positionMs < 0) {
      return { success: false, message: "Invalid seek position" }
    }
    const resolved = await this.resolveAppControlledController(roomId)
    if (!resolved.ok) return { success: false, message: resolved.message }
    const { api } = resolved.controller
    try {
      const playback = await api.getPlayback()
      if (!playback.track) {
        return { success: false, message: "Nothing is currently playing" }
      }
      const clamped =
        playback.durationMs != null && playback.durationMs > 0
          ? Math.min(Math.round(positionMs), playback.durationMs)
          : Math.round(positionMs)
      await api.seekTo(clamped)
      await this.afterTransportMutation(roomId, { progressMs: clamped })
      return { success: true, positionMs: clamped }
    } catch (error: unknown) {
      console.error("[PluginAPI] seekPlayback failed:", error)
      return { success: false, message: "Failed to seek playback" }
    }
  }

  private async resolveAppControlledController(
    roomId: string,
  ): Promise<{ ok: true; controller: PlaybackController } | { ok: false; message: string }> {
    const { findRoom } = await import("../../operations/data")
    const { isAppControlledPlayback } = await import("../roomTypeHelpers")
    const room = await findRoom({ context: this.context, roomId })
    if (!room) return { ok: false, message: "Room not found" }
    if (!isAppControlledPlayback(room)) {
      return { ok: false, message: "This action is only available in app-controlled playback mode" }
    }
    const { AdapterService } = await import("../../services/AdapterService")
    const controller = await new AdapterService(this.context).getRoomPlaybackController(roomId)
    if (!controller) {
      return { ok: false, message: "No playback controller configured for this room" }
    }
    return { ok: true, controller }
  }

  private async afterTransportMutation(roomId: string, observed: ObservedPlayback): Promise<void> {
    const { clearPlaybackStateCache } = await import("../../services/DJService")
    clearPlaybackStateCache(roomId)
    try {
      const { recomputeAnchoredSchedules } = await import(
        "../../operations/plugins/anchoredSchedules"
      )
      await recomputeAnchoredSchedules({ context: this.context, roomId, observed })
    } catch (error) {
      console.error("[PluginAPI] recomputeAnchoredSchedules failed:", error)
    }
  }

  async listMediaBridgeSayVoices(
    roomId: string,
  ): Promise<{ voices: Array<{ id: string; name: string; locale: string }> }> {
    try {
      const { getBridgeRpcClient, listSayVoices } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) return { voices: [] }
      return await listSayVoices({ rpc })
    } catch (e) {
      console.warn("[PluginAPI] listMediaBridgeSayVoices failed:", e)
      return { voices: [] }
    }
  }

  async speakOnMediaBridge(
    roomId: string,
    params: { text: string; voice: string },
  ): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      const { getBridgeRpcClient, speakOnBridge } = await import("@repo/adapter-bridge")
      const rpc = getBridgeRpcClient(roomId)
      if (!rpc) {
        return { ok: false, message: "The line is dead — the DJ Mac isn’t linked." }
      }
      const result = await speakOnBridge({ rpc, text: params.text, voice: params.voice })
      if (result.ok) return { ok: true }
      return { ok: false, message: result.message }
    } catch (e) {
      console.warn("[PluginAPI] speakOnMediaBridge failed:", e)
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Could not put the call through.",
      }
    }
  }
}

