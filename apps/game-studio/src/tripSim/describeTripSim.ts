import {
  FUND_PURPOSE_LABELS,
  INCIDENT_PRESETS,
  isIncidentPresetId,
  tripBook,
  vanPart,
  type TripMap,
} from "@repo/road-trip-map"
import type { SimEvent, TripEffect, TripLogEntry, TripState } from "@repo/plugin-road-trip/sim"

function eventLabel(map: TripMap, eventId: string | undefined): string {
  const event = map.events?.find((e) => e.id === eventId)
  return event ? `${event.icon} ${event.name}` : (eventId ?? "event")
}

/** Logged name and icon; entries from before ADR 0228 fall back to the preset. */
function incidentLabel(entry: { incident: string; name?: string; icon?: string }): string {
  const preset = isIncidentPresetId(entry.incident) ? INCIDENT_PRESETS[entry.incident] : undefined
  return `${entry.icon ?? preset?.icon ?? "⚠️"} ${entry.name ?? preset?.name ?? entry.incident}`
}

function siteName(map: TripMap, siteId: string | undefined): string {
  return map.sites.find((s) => s.id === siteId)?.name ?? siteId ?? "a site"
}

function routeName(map: TripMap, routeId: string | undefined): string {
  return map.routes?.find((r) => r.id === routeId)?.name ?? routeId ?? "a route"
}

function votesTally(votes: number[] | undefined, defaulted?: boolean): string {
  if (defaulted) return " (default)"
  return votes ? ` (${votes.join("–")})` : ""
}

/** What the next step will fire, in designer terms. */
export function describeSimEvent(event: SimEvent, map: TripMap, state: TripState): string {
  const payload = event.request?.payload
  switch (event.kind) {
    case "poll-close":
      if (event.target?.kind === "junction")
        return `Junction poll closes: ${routeName(map, event.routeId)}`
      if (event.target?.kind === "choice")
        return `Choice poll closes: ${state.incident?.name ?? "event"}`
      return `Exit poll closes: ${siteName(map, event.siteId)}`
    case "reveal":
      return `Reveal ${siteName(map, event.siteId)}`
    case "vote-due":
    case "skip-poll":
      return event.routeId
        ? `Junction poll opens: ${routeName(map, event.routeId)}`
        : `Exit poll opens: ${siteName(map, event.siteId)}`
    case "junction":
      return `Reach the fork for ${routeName(map, event.routeId)}`
    case "route-end":
      return `End of ${routeName(map, event.routeId)}`
    case "arrive":
      return `Reach ${siteName(map, event.siteId)}`
    case "fuel":
      return payload?.level === "empty" ? "Tank runs empty" : "Fuel runs low"
    case "scripted":
      return `Event: ${eventLabel(map, payload?.eventId)}`
    case "beat":
      return `Beat ${(payload?.beat ?? 0) + 1}: ${eventLabel(map, payload?.eventId)}`
    case "incident": {
      const incident = state.incident
      const step = incident?.steps[incident.step]
      const name = incident ? `${incident.icon} ${incident.name}` : "Incident"
      return step ? `${name}: ${step.kind} step ends` : `${name} step ends`
    }
    case "expire": {
      const blocker = state.blockers.find((b) => b.id === payload?.blockerId)
      if (blocker?.kind === "parked") return `Leave ${siteName(map, blocker.siteId)}`
      if (blocker?.kind === "fund") return "Fund closes"
      return "Hold ends"
    }
  }
}

function votesLabel(
  votes: { stop: number; skip: number } | undefined,
  defaulted?: boolean,
): string {
  if (defaulted) return " (default)"
  return votes ? ` (${votes.stop}–${votes.skip})` : ""
}

/** One timeline row for the sim log. */
export function describeLogEntry(entry: TripLogEntry): string {
  switch (entry.kind) {
    case "departed":
      return "🚐 Departed"
    case "site":
      switch (entry.phase) {
        case "revealed":
          return `👀 Revealed ${entry.name}`
        case "poll":
          return `🗳 Exit poll for ${entry.name}`
        case "stopped":
          return `🅿️ Pulled off at ${entry.name}${votesLabel(entry.votes, entry.defaulted)}`
        case "skipped":
          return `⬆ Kept driving past ${entry.name}${votesLabel(entry.votes, entry.defaulted)}`
        case "departed":
          return `🚐 Left ${entry.name}`
        case "bypassed":
          return `↪ ${entry.name} is off the route`
      }
    case "layer":
      return entry.phase === "unlocked" ? `🗺️ ${entry.name} unlocked` : `🗺️ ${entry.name} locked`
    case "junction":
      switch (entry.phase) {
        case "poll":
          return `🗳 Junction poll for ${entry.name}`
        case "take":
          return `🛣️ ${entry.name}: take it${votesTally(entry.votes, entry.defaulted)}`
        case "stay":
          return `🛣️ ${entry.name}: stay${votesTally(entry.votes, entry.defaulted)}`
        case "taken":
          return `↱ Turned onto ${entry.name}`
        case "passed":
          return `⬆ Passed the fork for ${entry.name}`
        case "rejoined":
          return `↳ ${entry.name} rejoined the road`
      }
    case "choice":
      return `🗳 ${entry.question} ${entry.label}${votesTally(entry.votes, entry.defaulted)}`
    case "pause":
      return entry.reason === "admin" ? "⏸ Paused" : "⏸ Paused: no game session"
    case "resume":
      return "▶ Resumed"
    case "fund": {
      const label = FUND_PURPOSE_LABELS[entry.purpose]
      if (entry.waived) return `💸 ${label} at ${entry.name} waived`
      return `💸 ${label} at ${entry.name}: ${entry.collected} / ${entry.cost} coins from ${entry.payers}`
    }
    case "fuel": {
      const gal = Math.round(entry.gallons * 10) / 10
      if (entry.level === "filled") return `⛽ Filled up (${gal} gal)`
      if (entry.level === "poured") return `⛽ Poured ${gal} gal from a Gas Canister`
      return entry.level === "low" ? `⛽ Low fuel (${gal} gal)` : "⛽ Out of gas"
    }
    case "incident": {
      const where = entry.siteName ? ` · ${entry.siteName}` : ""
      const by = entry.resolvedBy ? ` by ${entry.resolvedBy.name}` : ""
      return `${incidentLabel(entry)}: ${entry.step}${by}${where}`
    }
    case "part-installed":
      return `🔧 Installed ${vanPart(entry.partId)?.name ?? entry.partId}`
    case "book-read":
      return `📖 ${entry.name} read ${tripBook(entry.shortId)?.name ?? entry.shortId}${entry.learned ? "" : " (over their head)"}`
    case "arrived":
      return "🏁 Arrived"
    case "late":
      return "🏁 Arrived late"
    case "stranded":
      return "🛑 Stranded"
    case "ended":
      return "⏹ Trip ended"
  }
}

export function formatClock(ms: number): string {
  return new Date(ms).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })
}

/** Key items the van is holding, for the sim panel (ADR 0230). Null when it holds none. */
export function describeVanKeys(
  keys: readonly { icon: string; name: string; held: boolean }[],
): string | null {
  const held = keys.filter((key) => key.held)
  if (held.length === 0) return null
  return held.map((key) => `${key.icon} ${key.name}`).join(" · ")
}

/** "T+12:30" from departure. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = String(m).padStart(h > 0 ? 2 : 1, "0")
  return `${h > 0 ? `${h}:` : ""}${mm}:${String(s).padStart(2, "0")}`
}

/** A row in the Trip Sim timeline: log, narrative prose, or a sound effect. */
export type SimTimelineRow =
  | { kind: "log"; at: number; mile: number; text: string }
  | { kind: "narrate"; at: number; text: string; variant?: string }
  | { kind: "sound"; at: number; url: string; label: string }

/** Last path segment of a sound URL, for the timeline. */
export function soundEffectLabel(url: string): string {
  try {
    const path = new URL(url).pathname
    const name = path.split("/").filter(Boolean).at(-1)
    return name ? decodeURIComponent(name) : url
  } catch {
    const name = url.split("/").filter(Boolean).at(-1)
    return name ?? url
  }
}

/**
 * Timeline for the sim panel: structural log entries plus narrative and sound
 * effects (ADR 0240), oldest first. Same-`at` order is log → narrate → sound.
 */
export function buildSimTimeline(
  log: readonly TripLogEntry[],
  effects: readonly { at: number; effect: TripEffect }[],
): SimTimelineRow[] {
  const rows: SimTimelineRow[] = []
  for (const entry of log) {
    if (entry.kind === "site" && entry.phase === "revealed") continue
    rows.push({
      kind: "log",
      at: entry.at,
      mile: entry.mile,
      text: describeLogEntry(entry),
    })
  }
  for (const { at, effect } of effects) {
    if (effect.type === "narrate") {
      rows.push({
        kind: "narrate",
        at,
        text: effect.body,
        ...(effect.variant ? { variant: effect.variant } : effect.icon ? { variant: "site" } : {}),
      })
    } else if (effect.type === "sound") {
      rows.push({ kind: "sound", at, url: effect.url, label: soundEffectLabel(effect.url) })
    }
  }
  const rank = (row: SimTimelineRow) =>
    row.kind === "log" ? 0 : row.kind === "narrate" ? 1 : 2
  return rows.sort((a, b) => a.at - b.at || rank(a) - rank(b))
}
