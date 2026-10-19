import { FUND_PURPOSE_LABELS, INCIDENTS, vanPart, type TripMap } from "@repo/road-trip-map"
import type { SimEvent, TripLogEntry, TripState } from "@repo/plugin-road-trip/sim"

function siteName(map: TripMap, siteId: string | undefined): string {
  return map.sites.find((s) => s.id === siteId)?.name ?? siteId ?? "a site"
}

/** What the next step will fire, in designer terms. */
export function describeSimEvent(event: SimEvent, map: TripMap, state: TripState): string {
  const payload = event.request?.payload
  switch (event.kind) {
    case "poll-close":
      return `Exit poll closes: ${siteName(map, event.siteId)}`
    case "reveal":
      return `Reveal ${siteName(map, event.siteId)}`
    case "skip-poll":
      return `Exit poll opens: ${siteName(map, event.siteId)}`
    case "arrive":
      return `Reach ${siteName(map, event.siteId)}`
    case "fuel":
      return payload?.level === "empty" ? "Tank runs empty" : "Fuel runs low"
    case "scripted": {
      const scripted = map.scriptedEvents?.find((e) => e.id === payload?.eventId)
      return scripted ? `Scripted ${INCIDENTS[scripted.incident].name}` : "Scripted incident"
    }
    case "incident": {
      const incident = state.incident
      const step = incident?.steps[incident.step]
      const name = incident ? INCIDENTS[incident.incident].name : "Incident"
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

function votesLabel(votes: { stop: number; skip: number } | undefined, defaulted?: boolean): string {
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
      }
      return entry.name
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
      return entry.level === "low" ? `⛽ Low fuel (${gal} gal)` : "⛽ Out of gas"
    }
    case "incident": {
      const spec = INCIDENTS[entry.incident]
      const where = entry.siteName ? ` · ${entry.siteName}` : ""
      const by = entry.resolvedBy ? ` by ${entry.resolvedBy.name}` : ""
      return `${spec.emoji} ${spec.name}: ${entry.step}${by}${where}`
    }
    case "part-installed":
      return `🔧 Installed ${vanPart(entry.partId)?.name ?? entry.partId}`
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
  return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
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
