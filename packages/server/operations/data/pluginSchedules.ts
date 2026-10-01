import type { AppContext, PluginScheduleAnchor } from "@repo/types"
import { claimDueMembers } from "./claimDueMembers"

/** Global ZSET of plugin schedules: score = fireAt, member = roomId:pluginName:scheduleId */
export const PLUGIN_SCHEDULES_KEY = "plugin:schedules"

/** Hash of schedule payloads keyed by the same member string. */
export const PLUGIN_SCHEDULES_PAYLOAD_KEY = "plugin:schedules:payload"

export const PLUGIN_SCHEDULE_MIN_MS = 1_000
/** Seven days — larger than poll auto-close (24h) for recurring / long game timers. */
export const PLUGIN_SCHEDULE_MAX_MS = 7 * 24 * 60 * 60 * 1000

/** Per-room SET of playback-anchored schedule members (ADR 0196). */
export function anchoredSchedulesKey(roomId: string): string {
  return `plugin:schedules:anchored:${roomId}`
}

export type PluginScheduleRecord = {
  roomId: string
  pluginName: string
  scheduleId: string
  kind: string
  payload: unknown
  fireAt: number
  paused?: boolean
}

/** JSON stored in {@link PLUGIN_SCHEDULES_PAYLOAD_KEY}. Paused anchors live only here (ADR 0196). */
export type StoredPluginSchedule = {
  kind: string
  payload: unknown
  anchor?: PluginScheduleAnchor
  paused?: boolean
  remainingMs?: number
}

export function parseStoredPluginSchedule(raw: string | null | undefined): StoredPluginSchedule | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<StoredPluginSchedule>
    return {
      kind: typeof parsed.kind === "string" ? parsed.kind : "",
      payload: parsed.payload ?? null,
      ...(parsed.anchor ? { anchor: parsed.anchor } : {}),
      ...(parsed.paused ? { paused: true } : {}),
      ...(typeof parsed.remainingMs === "number" ? { remainingMs: parsed.remainingMs } : {}),
    }
  } catch {
    return null
  }
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

/**
 * Write a schedule. A `paused` anchored schedule is kept out of the ZSET so the
 * sweep cannot claim it; `fireAt` is ignored in that case.
 */
export async function schedulePluginCallback({
  context,
  roomId,
  pluginName,
  scheduleId,
  kind,
  fireAt,
  payload,
  anchor,
  paused,
  remainingMs,
}: {
  context: AppContext
  roomId: string
  pluginName: string
  scheduleId: string
  kind: string
  fireAt: number
  payload?: unknown
  anchor?: PluginScheduleAnchor
  paused?: boolean
  remainingMs?: number
}): Promise<void> {
  const member = scheduleMember(roomId, pluginName, scheduleId)
  const client = context.redis.pubClient
  const stored: StoredPluginSchedule = {
    kind,
    payload: payload ?? null,
    ...(anchor ? { anchor } : {}),
    ...(anchor && paused ? { paused: true, remainingMs: remainingMs ?? 0 } : {}),
  }
  await client.hSet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member, JSON.stringify(stored))
  if (anchor && paused) {
    await client.zRem(PLUGIN_SCHEDULES_KEY, member)
  } else {
    await client.zAdd(PLUGIN_SCHEDULES_KEY, { score: fireAt, value: member })
  }
  if (anchor) {
    await client.sAdd(anchoredSchedulesKey(roomId), member)
  } else {
    await client.sRem(anchoredSchedulesKey(roomId), member)
  }
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
  const deleted = await client.hDel(PLUGIN_SCHEDULES_PAYLOAD_KEY, member)
  const unanchored = await client.sRem(anchoredSchedulesKey(roomId), member)
  return removed === 1 || (deleted === 1 && unanchored === 1)
}

export async function getPluginSchedule({
  context,
  roomId,
  pluginName,
  scheduleId,
  now = Date.now(),
}: {
  context: AppContext
  roomId: string
  pluginName: string
  scheduleId: string
  now?: number
}): Promise<PluginScheduleRecord | null> {
  const member = scheduleMember(roomId, pluginName, scheduleId)
  const client = context.redis.pubClient
  const score = await client.zScore(PLUGIN_SCHEDULES_KEY, member)
  const stored = parseStoredPluginSchedule(await client.hGet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member))
  if (score == null) {
    if (!stored?.paused) return null
    return {
      roomId,
      pluginName,
      scheduleId,
      kind: stored.kind,
      payload: stored.payload,
      fireAt: now + (stored.remainingMs ?? 0),
      paused: true,
    }
  }
  return {
    roomId,
    pluginName,
    scheduleId,
    kind: stored?.kind ?? "",
    payload: stored?.payload ?? null,
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
 * Claim due schedules and load+delete their payloads. Members whose payload is
 * gone (cancelled or replaced mid-claim) are dropped rather than dispatched.
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
    const stored = parseStoredPluginSchedule(raw)
    if (!stored) continue
    if (stored.anchor) {
      await client.sRem(anchoredSchedulesKey(parsed.roomId), member)
    }
    claimed.push({ ...parsed, kind: stored.kind, payload: stored.payload })
  }

  return claimed
}
