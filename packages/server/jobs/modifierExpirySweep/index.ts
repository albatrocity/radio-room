import type { AppContext, JobApi } from "@repo/types"
import { sweepExpiredModifiers } from "../../operations/game/sweepExpiredModifiers"

/** Remove expired game modifiers (ADR 0191). Runs every second (quiet). */
export default async function modifierExpirySweepJobHandler({
  context,
}: {
  api: JobApi
  context: AppContext
}) {
  try {
    const { expired } = await sweepExpiredModifiers({ context })
    if (expired > 0) {
      console.log(`[Modifier Expiry Sweep] Expired ${expired} modifier(s)`)
    }
  } catch (e) {
    console.error("[Modifier Expiry Sweep] Error:", e)
  }
}
