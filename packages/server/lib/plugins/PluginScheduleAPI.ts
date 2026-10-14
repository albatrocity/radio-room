import type { PluginScheduleAnchor, SchedulePluginAPI } from "@repo/types"
import { PluginCapability } from "./PluginCapability"

/** Scoped durable schedules for one plugin (ADR 0190, ADR 0201). */
export class PluginScheduleAPI extends PluginCapability implements SchedulePluginAPI {
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
    if (!this.pluginName || !this.roomId) {
      return { ok: false, message: "Plugin identity is required." }
    }
    if (!params.id || !params.kind) {
      return { ok: false, message: "id and kind are required." }
    }
    if (params.anchor) {
      const { scheduleAnchoredPluginCallback } = await import(
        "../../operations/plugins/anchoredSchedules"
      )
      return scheduleAnchoredPluginCallback({
        context: this.context,
        roomId: this.roomId,
        pluginName: this.pluginName,
        scheduleId: params.id,
        kind: params.kind,
        anchor: params.anchor,
        payload: params.payload,
      })
    }
    const { resolveScheduleFireAt, schedulePluginCallback } = await import(
      "../../operations/data/pluginSchedules"
    )
    const resolved = resolveScheduleFireAt({
      at: params.at,
      durationMs: params.durationMs,
    })
    if (!resolved.ok) return resolved
    await schedulePluginCallback({
      context: this.context,
      roomId: this.roomId,
      pluginName: this.pluginName,
      scheduleId: params.id,
      kind: params.kind,
      fireAt: resolved.fireAt,
      payload: params.payload,
    })
    return { ok: true, fireAt: resolved.fireAt }
  }

  async cancelSchedule(id: string): Promise<boolean> {
    if (!this.pluginName || !this.roomId) return false
    const { cancelPluginSchedule } = await import("../../operations/data/pluginSchedules")
    return cancelPluginSchedule({
      context: this.context,
      roomId: this.roomId,
      pluginName: this.pluginName,
      scheduleId: id,
    })
  }

  async getSchedule(id: string): Promise<{
    id: string
    kind: string
    fireAt: number
    payload: unknown
    paused?: boolean
  } | null> {
    if (!this.pluginName || !this.roomId) return null
    const { getPluginSchedule } = await import("../../operations/data/pluginSchedules")
    const record = await getPluginSchedule({
      context: this.context,
      roomId: this.roomId,
      pluginName: this.pluginName,
      scheduleId: id,
    })
    if (!record) return null
    return {
      id: record.scheduleId,
      kind: record.kind,
      fireAt: record.fireAt,
      payload: record.payload,
      ...(record.paused ? { paused: true } : {}),
    }
  }
}

