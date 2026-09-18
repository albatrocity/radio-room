import type { AppContext, JobApi } from "@repo/types"

/** Warn when Redis used_memory approaches maxmemory (ADR 0186). */
const WARN_RATIO = 0.8
const CRITICAL_RATIO = 0.9

function parseInfoMemory(info: string): { used: number; max: number } | null {
  const usedMatch = /used_memory:(\d+)/.exec(info)
  const maxMatch = /maxmemory:(\d+)/.exec(info)
  if (!usedMatch?.[1] || !maxMatch?.[1]) return null
  return { used: Number(usedMatch[1]), max: Number(maxMatch[1]) }
}

export default async function redisMemoryJobHandler({
  context,
}: {
  api: JobApi
  context: AppContext
}) {
  try {
    const info = await context.redis.pubClient.info("memory")
    const parsed = parseInfoMemory(info)
    if (!parsed) {
      console.warn("[Redis Memory] Could not parse INFO memory")
      return
    }
    if (parsed.max <= 0) {
      // No maxmemory configured (common in local Docker) — skip.
      return
    }
    const ratio = parsed.used / parsed.max
    const pct = Math.round(ratio * 100)
    const usedMb = Math.round(parsed.used / (1024 * 1024))
    const maxMb = Math.round(parsed.max / (1024 * 1024))
    if (ratio >= CRITICAL_RATIO) {
      console.error(
        `[Redis Memory] CRITICAL: used_memory ${usedMb}MB / maxmemory ${maxMb}MB (${pct}%). Eviction or OOM imminent.`,
      )
    } else if (ratio >= WARN_RATIO) {
      console.warn(
        `[Redis Memory] HIGH: used_memory ${usedMb}MB / maxmemory ${maxMb}MB (${pct}%).`,
      )
    }
  } catch (e) {
    console.error("[Redis Memory] Error:", e)
  }
}

export { parseInfoMemory, WARN_RATIO, CRITICAL_RATIO }
