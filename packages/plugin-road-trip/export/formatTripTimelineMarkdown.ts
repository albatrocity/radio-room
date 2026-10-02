import type { TripMap } from "@repo/road-trip-map"
import { resolveSiteSettings } from "@repo/road-trip-map"
import type { SkipVotes, TripLogEntry, TripState } from "../trip/state"

export type TripTimelineInput = {
  map: TripMap
  state: TripState
  /** Chronological (oldest first). */
  log: TripLogEntry[]
  /** IANA zone for clock times (the show's timezone); defaults to UTC. */
  timeZone?: string
}

/** Room-export section for a trip (ADR 0206). Pure; snapshot-tested. */
export function formatTripTimelineMarkdown({
  map,
  state,
  log,
  timeZone = "UTC",
}: TripTimelineInput): string {
  const clock = (at: number) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(at)
  const departedAt = state.departedAt
  const sitesById = new Map(map.sites.map((site) => [site.id, site]))

  const lines: string[] = ["## Road Trip Timeline", "", "| | |", "|---|---|"]
  lines.push(`| Map | ${escapeCell(map.title)} (rev ${map.revision}) |`)

  if (departedAt !== undefined) {
    const end = state.arrivedAt ?? state.endedAt
    let arrival = end !== undefined ? clock(end) : "—"
    if (state.arrivedAt !== undefined && state.targetArrivalAt !== undefined) {
      const delta = Math.round((state.arrivedAt - state.targetArrivalAt) / 60_000)
      const offset = delta === 0 ? "on time" : `${delta > 0 ? `+${delta}` : delta} min`
      arrival += ` (target ${clock(state.targetArrivalAt)}, ${offset})`
    } else if (state.status === "stranded") {
      arrival += " (ended before arrival)"
    }
    lines.push(`| Departed / arrived | ${clock(departedAt)} / ${arrival} |`)

    const parkedMs = parkedDuration(log)
    const totalMs = (end ?? log[log.length - 1]?.at ?? departedAt) - departedAt
    lines.push(
      `| Drive / parked | ${minutes(Math.max(0, totalMs - parkedMs))} / ${minutes(parkedMs)} |`,
    )
  } else {
    lines.push("| Departed / arrived | Not departed |")
  }

  const visited = map.sites.filter((s) => state.sites[s.id]?.visitedAt !== undefined)
  const skipped = map.sites.filter((s) => state.sites[s.id]?.phase === "skipped")
  const mandatory = map.sites.filter(
    (s) => s.role !== "destination" && !resolveSiteSettings(map, s).optional,
  )
  lines.push(
    `| Sites | ${visited.length} of ${map.sites.length} visited · ${skipped.length} skipped · ${mandatory.length} mandatory |`,
  )

  lines.push("", "### Timeline", "", "| Time | T+ | Mile | Event |", "|---|---|---|---|")
  for (const entry of log) {
    const event = describe(entry, sitesById)
    if (!event) continue
    const tPlus = departedAt !== undefined ? elapsed(entry.at - departedAt) : "—"
    lines.push(
      `| ${clock(entry.at)} | ${tPlus} | ${entry.mile.toFixed(1)} | ${escapeCell(event)} |`,
    )
  }

  if (visited.length > 0) {
    lines.push("", "### Sites visited", "")
    for (const site of visited) {
      const image = site.imageUrl ? ` ([image](${site.imageUrl}))` : ""
      lines.push(`- ${site.icon} **${site.name}** — ${site.description}${image}`)
    }
  }

  return lines.join("\n")
}

function describe(
  entry: TripLogEntry,
  sites: Map<string, TripMap["sites"][number]>,
): string | null {
  switch (entry.kind) {
    case "departed":
      return "🚐 Departed"
    case "site": {
      const icon = sites.get(entry.siteId)?.icon ?? "📍"
      if (entry.phase === "stopped")
        return `${icon} ${entry.name}: stopped${voteNote(entry.votes, entry.defaulted, "stop")}`
      if (entry.phase === "skipped")
        return `${icon} ${entry.name}: skipped${voteNote(entry.votes, entry.defaulted, "skip")}`
      return null
    }
    case "pause":
      return entry.reason === "admin" ? "⏸ Paused by the host" : "⏸ Paused: no game session"
    case "resume":
      return "▶️ Back on the road"
    case "arrived":
      return "🏁 Arrived"
    case "late":
      return "🏁 Arrived late"
    case "stranded":
      return "🛑 Trip ended before arrival"
    case "ended":
      return "🏁 Trip ended"
  }
}

function voteNote(
  votes: SkipVotes | undefined,
  defaulted: boolean | undefined,
  outcome: "stop" | "skip",
): string {
  const total = votes ? votes.stop + votes.skip : 0
  if (!votes || total === 0) return defaulted ? " (no votes, default)" : ""
  if (votes.stop === votes.skip) return ` (tie ${votes.stop}–${votes.skip}, default)`
  const [won, lost] = outcome === "stop" ? [votes.stop, votes.skip] : [votes.skip, votes.stop]
  return ` (${won}–${lost})`
}

function parkedDuration(log: TripLogEntry[]): number {
  let total = 0
  let parkedAt: number | null = null
  for (const entry of log) {
    if (entry.kind === "site" && entry.phase === "stopped") parkedAt = entry.at
    if (entry.kind === "site" && entry.phase === "departed" && parkedAt !== null) {
      total += entry.at - parkedAt
      parkedAt = null
    }
  }
  return total
}

function minutes(ms: number): string {
  return `${Math.round(ms / 60_000)} min`
}

function elapsed(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000))
  const hours = Math.floor(totalMinutes / 60)
  return `${hours}:${String(totalMinutes % 60).padStart(2, "0")}`
}

function escapeCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\n/g, " ")
}
