import type { AppContext, JobApi } from "@repo/types"
import { sweepExpiredPolls } from "../../operations/polls/sweepExpiredPolls"

/** Close polls whose closesAt has elapsed (ADR 0189). Runs every second (quiet). */
export default async function pollAutoCloseJobHandler({
  context,
}: {
  api: JobApi
  context: AppContext
}) {
  try {
    const { closed } = await sweepExpiredPolls({ context })
    if (closed > 0) {
      console.log(`[Poll Auto-Close] Closed ${closed} expired poll(s)`)
    }
  } catch (e) {
    console.error("[Poll Auto-Close] Error:", e)
  }
}
