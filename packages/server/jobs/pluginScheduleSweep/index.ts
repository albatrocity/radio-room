import type { AppContext, JobApi } from "@repo/types"
import { sweepPluginSchedules } from "../../operations/plugins/sweepPluginSchedules"

/** Fire due plugin schedules (ADR 0190). Runs every second (quiet). */
export default async function pluginScheduleSweepJobHandler({
  context,
}: {
  api: JobApi
  context: AppContext
}) {
  try {
    const { dispatched } = await sweepPluginSchedules({ context })
    if (dispatched > 0) {
      console.log(`[Plugin Schedule Sweep] Dispatched ${dispatched} schedule(s)`)
    }
  } catch (e) {
    console.error("[Plugin Schedule Sweep] Error:", e)
  }
}
