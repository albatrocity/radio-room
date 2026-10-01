import type { AppContext, PluginScheduleAnchor, PluginScheduleRevision } from "@repo/types"
import {
  PLUGIN_SCHEDULES_KEY,
  PLUGIN_SCHEDULES_PAYLOAD_KEY,
  PLUGIN_SCHEDULE_MAX_MS,
  PLUGIN_SCHEDULE_MIN_MS,
  anchoredSchedulesKey,
  parseScheduleMember,
  parseStoredPluginSchedule,
  resolveScheduleFireAt,
  schedulePluginCallback,
  type StoredPluginSchedule,
} from "../data/pluginSchedules"
import { readRoomPlayback } from "../playback/readRoomPlayback"

/** Moves smaller than this are not reported to plugins (ADR 0196). */
export const ANCHOR_REVISION_THRESHOLD_MS = 500

export type ObservedPlayback = {
  state?: "playing" | "paused" | "stopped"
  progressMs?: number
}

type AnchoredScheduleResult =
  | { ok: true; fireAt: number; anchored: boolean; paused: boolean }
  | { ok: false; message: string }

function isAfterPlayback(anchor: PluginScheduleAnchor): boolean {
  return typeof anchor.afterPlaybackMs === "number"
}

function validateAnchor(anchor: PluginScheduleAnchor): string | null {
  const values = [anchor.afterPlaybackMs, anchor.atProgressMs, anchor.leadMs].filter(
    (v) => v != null,
  )
  if (values.length !== 1) {
    return "anchor needs exactly one of afterPlaybackMs, atProgressMs, or leadMs"
  }
  const [value] = values
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return "anchor offset must be a non-negative number of ms"
  }
  return null
}

/** Playhead position (ms into the track) at which a playhead anchor fires. */
function playheadTarget(anchor: PluginScheduleAnchor, durationMs: number | null): number | null {
  if (typeof anchor.atProgressMs === "number") return anchor.atProgressMs
  if (typeof anchor.leadMs === "number") {
    return durationMs == null ? null : Math.max(0, durationMs - anchor.leadMs)
  }
  return null
}

type RegistryWithRevisions = {
  dispatchScheduleRevised?: (params: {
    roomId: string
    pluginName: string
    revision: PluginScheduleRevision
  }) => Promise<void>
}

async function notifyRevision(
  context: AppContext,
  roomId: string,
  pluginName: string,
  revision: PluginScheduleRevision,
): Promise<void> {
  const registry = context.pluginRegistry as RegistryWithRevisions | undefined
  if (!registry?.dispatchScheduleRevised) return
  try {
    await registry.dispatchScheduleRevised({ roomId, pluginName, revision })
  } catch (error) {
    console.error(
      `[anchoredSchedules] dispatchScheduleRevised failed for ${roomId}:${pluginName}:${revision.scheduleId}:`,
      error,
    )
  }
}

/**
 * Create a playback-anchored schedule (ADR 0196). `afterPlaybackMs` falls back to
 * wall clock when playback cannot be read; playhead anchors fail instead.
 */
export async function scheduleAnchoredPluginCallback({
  context,
  roomId,
  pluginName,
  scheduleId,
  kind,
  anchor,
  payload,
  now = Date.now(),
}: {
  context: AppContext
  roomId: string
  pluginName: string
  scheduleId: string
  kind: string
  anchor: PluginScheduleAnchor
  payload?: unknown
  now?: number
}): Promise<AnchoredScheduleResult> {
  const invalid = validateAnchor(anchor)
  if (invalid) return { ok: false, message: invalid }

  const read = await readRoomPlayback({ context, roomId })
  if (!read.success) {
    if (!isAfterPlayback(anchor)) return { ok: false, message: read.message }
    const resolved = resolveScheduleFireAt({ durationMs: anchor.afterPlaybackMs, now })
    if (!resolved.ok) return resolved
    await schedulePluginCallback({
      context,
      roomId,
      pluginName,
      scheduleId,
      kind,
      fireAt: resolved.fireAt,
      payload,
    })
    return { ok: true, fireAt: resolved.fireAt, anchored: false, paused: false }
  }

  let remainingMs: number
  if (isAfterPlayback(anchor)) {
    remainingMs = anchor.afterPlaybackMs as number
  } else {
    const target = playheadTarget(anchor, read.durationMs)
    if (target == null) return { ok: false, message: "Track duration is unavailable" }
    if (read.progressMs == null) return { ok: false, message: "Playback position is unavailable" }
    remainingMs = target - read.progressMs
  }
  if (remainingMs < PLUGIN_SCHEDULE_MIN_MS || remainingMs > PLUGIN_SCHEDULE_MAX_MS) {
    return {
      ok: false,
      message: `anchor must resolve to between ${PLUGIN_SCHEDULE_MIN_MS} and ${PLUGIN_SCHEDULE_MAX_MS} ms from now`,
    }
  }

  const paused = read.state !== "playing"
  const fireAt = now + remainingMs
  await schedulePluginCallback({
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
  })
  return { ok: true, fireAt, anchored: true, paused }
}

type AnchoredEntry = {
  member: string
  pluginName: string
  scheduleId: string
  stored: StoredPluginSchedule & { anchor: PluginScheduleAnchor }
}

async function loadAnchoredEntries(
  context: AppContext,
  roomId: string,
  members: string[],
): Promise<AnchoredEntry[]> {
  const client = context.redis.pubClient
  const setKey = anchoredSchedulesKey(roomId)
  const entries: AnchoredEntry[] = []
  for (const member of members) {
    const parsed = parseScheduleMember(member)
    const stored = parseStoredPluginSchedule(await client.hGet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member))
    if (!parsed || !stored?.anchor) {
      await client.sRem(setKey, member)
      continue
    }
    entries.push({
      member,
      pluginName: parsed.pluginName,
      scheduleId: parsed.scheduleId,
      stored: stored as AnchoredEntry["stored"],
    })
  }
  return entries
}

/**
 * Re-project anchored schedules after a transport change (ADR 0196).
 *
 * `observed` is what the caller just did or learned; it wins over a controller
 * read, which can lag a command. `currentTrackId` (on TRACK_CHANGED) cancels
 * anchors bound to a different track.
 */
export async function recomputeAnchoredSchedules({
  context,
  roomId,
  observed,
  currentTrackId,
  now = Date.now(),
}: {
  context: AppContext
  roomId: string
  observed?: ObservedPlayback
  currentTrackId?: string | null
  now?: number
}): Promise<void> {
  const client = context.redis.pubClient
  const setKey = anchoredSchedulesKey(roomId)
  if ((await client.sCard(setKey)) === 0) return

  let entries = await loadAnchoredEntries(context, roomId, await client.sMembers(setKey))

  if (currentTrackId !== undefined) {
    const kept: AnchoredEntry[] = []
    for (const entry of entries) {
      const boundTo = entry.stored.anchor.trackId
      if (!boundTo || boundTo === currentTrackId) {
        kept.push(entry)
        continue
      }
      await client.zRem(PLUGIN_SCHEDULES_KEY, entry.member)
      const deleted = await client.hDel(PLUGIN_SCHEDULES_PAYLOAD_KEY, entry.member)
      await client.sRem(setKey, entry.member)
      if (deleted === 1) {
        await notifyRevision(context, roomId, entry.pluginName, {
          scheduleId: entry.scheduleId,
          kind: entry.stored.kind,
          fireAt: now,
          paused: false,
          remainingMs: 0,
          cancelled: true,
        })
      }
    }
    entries = kept
  }
  if (entries.length === 0) return

  const needsPlayhead = entries.some((e) => !isAfterPlayback(e.stored.anchor))
  let snapshot: { state: ObservedPlayback["state"]; progressMs: number | null; durationMs: number | null } | null =
    null
  if (observed?.state === undefined || needsPlayhead) {
    const read = await readRoomPlayback({ context, roomId })
    if (read.success) snapshot = read
  }
  const state = observed?.state ?? snapshot?.state
  if (!state) return
  const progressMs = observed?.progressMs ?? snapshot?.progressMs ?? null
  const durationMs = snapshot?.durationMs ?? null
  const playing = state === "playing"

  for (const entry of entries) {
    const { member, stored } = entry
    const wasPaused = stored.paused === true
    const score = wasPaused ? null : await client.zScore(PLUGIN_SCHEDULES_KEY, member)
    if (!wasPaused && score == null) continue

    const currentRemaining = wasPaused ? (stored.remainingMs ?? 0) : Math.max(0, (score as number) - now)
    let remainingMs = currentRemaining
    if (!isAfterPlayback(stored.anchor)) {
      const target = playheadTarget(stored.anchor, durationMs)
      if (target != null && progressMs != null) remainingMs = Math.max(0, target - progressMs)
    }

    const revise = (paused: boolean, remaining: number) =>
      notifyRevision(context, roomId, entry.pluginName, {
        scheduleId: entry.scheduleId,
        kind: stored.kind,
        fireAt: now + remaining,
        paused,
        remainingMs: remaining,
        cancelled: false,
      })

    if (playing) {
      const fireAt = now + remainingMs
      if (wasPaused) {
        const running: StoredPluginSchedule = {
          kind: stored.kind,
          payload: stored.payload,
          anchor: stored.anchor,
        }
        await client.hSet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member, JSON.stringify(running))
        await client.zAdd(PLUGIN_SCHEDULES_KEY, { score: fireAt, value: member })
        await revise(false, remainingMs)
      } else if (Math.abs(fireAt - (score as number)) > ANCHOR_REVISION_THRESHOLD_MS) {
        await client.zAdd(PLUGIN_SCHEDULES_KEY, { score: fireAt, value: member }, { XX: true })
        await revise(false, remainingMs)
      }
      continue
    }

    if (!wasPaused) {
      const claimed = await client.zRem(PLUGIN_SCHEDULES_KEY, member)
      if (claimed === 0) continue
      const pausedEntry: StoredPluginSchedule = { ...stored, paused: true, remainingMs }
      await client.hSet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member, JSON.stringify(pausedEntry))
      await revise(true, remainingMs)
    } else if (Math.abs(remainingMs - currentRemaining) > ANCHOR_REVISION_THRESHOLD_MS) {
      const pausedEntry: StoredPluginSchedule = { ...stored, paused: true, remainingMs }
      await client.hSet(PLUGIN_SCHEDULES_PAYLOAD_KEY, member, JSON.stringify(pausedEntry))
      await revise(true, remainingMs)
    }
  }
}
