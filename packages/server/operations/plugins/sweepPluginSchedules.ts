import type { AppContext } from "@repo/types"
import { claimDuePluginSchedules } from "../data/pluginSchedules"

/**
 * Claim due plugin schedules and dispatch to PluginRegistry (ADR 0190).
 */
export async function sweepPluginSchedules({
  context,
  now = Date.now(),
}: {
  context: AppContext
  now?: number
}): Promise<{ dispatched: number }> {
  const due = await claimDuePluginSchedules({ context, now })
  if (due.length === 0) return { dispatched: 0 }

  const registry = context.pluginRegistry as
    | {
        dispatchScheduled?: (params: {
          roomId: string
          pluginName: string
          kind: string
          payload: unknown
          scheduleId: string
        }) => Promise<void>
      }
    | undefined

  if (!registry?.dispatchScheduled) {
    console.error("[Plugin Schedule Sweep] pluginRegistry.dispatchScheduled unavailable")
    return { dispatched: 0 }
  }

  let dispatched = 0
  for (const item of due) {
    try {
      await registry.dispatchScheduled({
        roomId: item.roomId,
        pluginName: item.pluginName,
        kind: item.kind,
        payload: item.payload,
        scheduleId: item.scheduleId,
      })
      dispatched++
    } catch (error) {
      console.error(
        `[Plugin Schedule Sweep] Failed to dispatch ${item.roomId}:${item.pluginName}:${item.scheduleId}:`,
        error,
      )
    }
  }

  return { dispatched }
}
