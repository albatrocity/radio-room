import type { AppContext } from "@repo/types"
import { claimDueMembers } from "./claimDueMembers"

/** Global ZSET of plugin schedules: score = fireAt, member = roomId:pluginName:scheduleId */
export const PLUGIN_SCHEDULES_KEY = "plugin:schedules"

/** Hash of schedule payloads keyed by the same member string. */
export const PLUGIN_SCHEDULES_PAYLOAD_KEY = "plugin:schedules:payload"

export const PLUGIN_SCHEDULE_MIN_MS = 1_000
/** Seven days — larger than poll auto-close (24h) for recurring / long game timers. */
export const PLUGIN_SCHEDULE_MAX_MS = 7 * 24 * 60 * 60 * 1000

export type PluginScheduleRecord = {
  roomId: string
  pluginName: string
  scheduleId: string
  kind: string
  payload: unknown
  fireAt: number
}

export function scheduleMember(roomId: string, pluginName: string, scheduleId: string): string {
  return `${roomId}:${pluginName}:${scheduleId}`
}

export function parseScheduleMember(
  member: string,
): { roomId: string; pluginName: string; scheduleId: string } | null {
  const first = member.indexOf(":")
  if (first <= 0) return null
  const second = member.indexOf(":", first + 1)
  if (second <= first + 1) return null
  const roomId = member.slice(0, first)
  const pluginName = member.slice(first + 1, second)
  const scheduleId = member.slice(second + 1)
  if (!roomId || !pluginName || !scheduleId) return null
  return { roomId, pluginName, scheduleId }
}

export function resolveScheduleFireAt({
  at,
  durationMs,
  now = Date.now(),
}: {
  at?: number | null
  durationMs?: number | null
  now?: number
}): { ok: true; fireAt: number } | { ok: false; message: string } {
  if (durationMs != null) {
    if (
      !Number.isFinite(durationMs) ||
      durationMs < PLUGIN_SCHEDULE_MIN_MS ||
      durationMs > PLUGIN_SCHEDULE_MAX_MS
    ) {
      return {
        ok: false,
        message: `durationMs must be between ${PLUGIN_SCHEDULE_MIN_MS} and ${PLUGIN_SCHEDULE_MAX_MS} ms`,
      }
    }
    return { ok: true, fireAt: now + durationMs }
  }
  if (at != null) {
    if (!Number.isFinite(at)) {
      return { ok: false, message: "at must be a finite epoch ms" }
    }
    const delta = at - now
    if (delta < PLUGIN_SCHEDULE_MIN_MS || delta > PLUGIN_SCHEDULE_MAX_MS) {
      return {
        ok: false,
        message: `at must be between ${PLUGIN_SCHEDULE_MIN_MS}ms and ${PLUGIN_SCHEDULE_MAX_MS}ms from now`,
      }
    }
    return { ok: true, fireAt: at }
  }
  return { ok: false, message: "at or durationMs is required" }
}

export async function schedulePluginCallback({
  context,
  roomId,
  pluginName,
  scheduleId,
  kind,
  fireAt,
  payload,
}: {
  context: AppContext
  roomId: string
  pluginName: string
  scheduleId: string
  kind: string
  fireAt: number
  payload?: unknown
}): Promise<void> {
  const member = scheduleMember(roomId, pluginName, scheduleId)
  const client = context.redis.pubClient
  await client.zAdd(PLUGIN_SCHEDULES_KEY, { score: fireAt, value: member })
  await client.hSet(
    PLUGIN_SCHEDULES_PAYLOAD_KEY,
    member,
    JSON.stringify({ kind, payload: payload ?? null }),
  )
}

export async function cancelPluginSchedule({
  context,
  roomId,
  pluginName,
  scheduleId,
}: {
  context: AppContext
  roomId: string
  pluginName: string
  scheduleId: string
}): Promise<boolean> {
  const member = scheduleMember(roomId, pluginName, scheduleId)
  const client = context.redis.pubClient
  const removed = await client.zRem(PLUGIN_SCHEDULES_KEY, member)
  await client.hDel(PLUGIN_SCHEDULES_PAYLOAD_KEY, member)
  return removed === 1
}

export async function getPluginSchedule({
  context,
  roomId,
  pluginName,
  scheduleId,
}: {
  context: AppContext
  roomId: string
  pluginName: string
  scheduleId: string
}): Promise<PluginScheduleRecord | null> {
  const member = scheduleMember(roomId, pluginName, scheduleId)
  const client = context.redis.pubClient
  const score = await client.zScore(PLUGIN_SCHEDULES_KEY, member)
  if (score == null) return null
  const raw = await client.hGet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member)
  let kind = ""
  let payload: unknown = null
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { kind?: string; payload?: unknown }
      kind = typeof parsed.kind === "string" ? parsed.kind : ""
      payload = parsed.payload ?? null
    } catch {
      // ignore corrupt payload
    }
  }
  return {
    roomId,
    pluginName,
    scheduleId,
    kind,
    payload,
    fireAt: score,
  }
}

export type ClaimedPluginSchedule = {
  roomId: string
  pluginName: string
  scheduleId: string
  kind: string
  payload: unknown
}

/**
 * Claim due schedules and load+delete their payloads.
 */
export async function claimDuePluginSchedules({
  context,
  now = Date.now(),
}: {
  context: AppContext
  now?: number
}): Promise<ClaimedPluginSchedule[]> {
  const members = await claimDueMembers({ context, key: PLUGIN_SCHEDULES_KEY, now })
  if (members.length === 0) return []

  const client = context.redis.pubClient
  const claimed: ClaimedPluginSchedule[] = []

  for (const member of members) {
    const parsed = parseScheduleMember(member)
    if (!parsed) continue
    const raw = await client.hGet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member)
    await client.hDel(PLUGIN_SCHEDULES_PAYLOAD_KEY, member)
    let kind = ""
    let payload: unknown = null
    if (raw) {
      try {
        const parsedPayload = JSON.parse(raw) as { kind?: string; payload?: unknown }
        kind = typeof parsedPayload.kind === "string" ? parsedPayload.kind : ""
        payload = parsedPayload.payload ?? null
      } catch {
        // ignore
      }
    }
    claimed.push({ ...parsed, kind, payload })
  }

  return claimed
}
