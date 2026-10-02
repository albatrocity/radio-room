import type { TripMap } from "@repo/road-trip-map"
import {
  FUND_PURPOSE_LABELS,
  INCIDENTS,
  resolveSiteSettings,
  vanConsumable,
  vanPart,
} from "@repo/road-trip-map"
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
  const funds = log.filter((entry): entry is FundEntry => entry.kind === "fund")
  if (funds.length > 0) {
    const coins = funds.reduce((sum, f) => sum + f.collected, 0)
    const gasStops = funds.filter((f) => f.purpose === "gas").length
    const incidentCosts = funds.length - gasStops
    const extra =
      incidentCosts > 0 ? ` · ${incidentCosts} incident cost${incidentCosts === 1 ? "" : "s"}` : ""
    lines.push(
      `| Money | ${coins} coins · ${gasStops} gas stop${gasStops === 1 ? "" : "s"}${extra} |`,
    )
  }
  const incidents = log.filter((e) => e.kind === "incident" && e.step === "started").length
  if (incidents > 0) {
    const tows = log.filter((e) => e.kind === "incident" && e.step === "towed").length
    lines.push(
      `| Incidents | ${incidents}${tows > 0 ? ` · ${tows} tow${tows === 1 ? "" : "s"}` : ""} |`,
    )
  }

  lines.push("", "### Timeline", "", "| Time | T+ | Mile | Event |", "|---|---|---|---|")
  for (let i = 0; i < log.length; i++) {
    const entry = log[i]!
    // A fill right after its fund step is folded into the fund row.
    const fill = entry.kind === "fund" ? log[i + 1] : undefined
    const filled = fill?.kind === "fuel" && fill.level === "filled" ? fill.gallons : undefined
    if (filled !== undefined) i++
    const event = entry.kind === "fund" ? describeFund(entry, filled) : describe(entry, sitesById)
    if (!event) continue
    const tPlus = departedAt !== undefined ? elapsed(entry.at - departedAt) : "—"
    lines.push(
      `| ${clock(entry.at)} | ${tPlus} | ${entry.mile.toFixed(1)} | ${escapeCell(event)} |`,
    )
  }

  const travelers = travelerRows(funds, log)
  if (travelers.length > 0) {
    lines.push("", "### Travelers", "", "| Listener | Coins paid | Parts |", "|---|---|---|")
    for (const traveler of travelers) {
      const parts = traveler.parts.length > 0 ? traveler.parts.join(", ") : "—"
      lines.push(`| ${escapeCell(traveler.name)} | ${traveler.amount} | ${escapeCell(parts)} |`)
    }
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
    case "fuel":
      if (entry.level === "low") return `⛽ Low fuel (${entry.gallons.toFixed(1)} gal)`
      if (entry.level === "empty") return "⛽ Ran out of gas"
      return `⛽ Filled ${entry.gallons.toFixed(1)} gal`
    case "fund":
      return describeFund(entry, undefined)
    case "incident":
      return describeIncident(entry)
    case "part-installed": {
      const part = vanPart(entry.partId)
      const replaced = entry.replaced ? ` (replaced the ${entry.replaced})` : ""
      return `${part?.emoji ?? "🔧"} ${entry.name} installed ${part?.name ?? entry.partId}${replaced}`
    }
  }
}

type FundEntry = Extract<TripLogEntry, { kind: "fund" }>
type IncidentEntry = Extract<TripLogEntry, { kind: "incident" }>

const FUND_ICONS: Record<FundEntry["purpose"], string> = {
  gas: "⛽",
  roadside: "🧰",
  tow: "🚚",
  repair: "🔧",
  delivery: "⛽",
}

function describeFund(entry: FundEntry, filled: number | undefined): string {
  const icon = FUND_ICONS[entry.purpose]
  const label = FUND_PURPOSE_LABELS[entry.purpose]
  const name =
    entry.purpose === "gas" || entry.name.toLowerCase() === label.toLowerCase()
      ? entry.purpose === "gas"
        ? entry.name
        : label
      : `${label} (${entry.name})`
  if (entry.waived) return `${icon} ${name}: waived by the host`
  const coins =
    entry.collected < entry.cost
      ? `${entry.collected} of ${entry.cost} coins`
      : `${entry.collected} coins`
  const from =
    entry.payers > 0 ? ` from ${entry.payers} traveler${entry.payers === 1 ? "" : "s"}` : ""
  const fill = filled !== undefined ? `, filled ${filled.toFixed(1)} gal` : ""
  const short =
    entry.collected < entry.cost
      ? entry.purpose === "gas"
        ? " (short; filled anyway)"
        : " (short; done anyway)"
      : ""
  return `${icon} ${name}: ${coins}${from}${fill}${short}`
}

function describeIncident(entry: IncidentEntry): string | null {
  const spec = INCIDENTS[entry.incident]
  switch (entry.step) {
    case "started": {
      const source =
        entry.source === "host" ? " (host)" : entry.source === "scripted" ? " (scripted)" : ""
      return `${spec.emoji} ${spec.name}${source}`
    }
    case "immune":
      return `${spec.emoji} ${spec.name} shrugged off by Road-Grip Tires`
    case "resolved": {
      const by = entry.resolvedBy
      const item = by ? (vanConsumable(by.itemId.split(":").pop() ?? "")?.name ?? "an item") : ""
      return by ? `${spec.emoji} ${by.name} used ${item}` : `${spec.emoji} ${spec.name} resolved`
    }
    case "aaa":
      return `💳 ${entry.resolvedBy?.name ?? "Someone"}'s AAA card covered it`
    case "towed":
      return `🚚 Towed ${(entry.miles ?? 0).toFixed(1)} mi to ${entry.siteName ?? "the mechanic"}`
    case "skipped":
      return `⏭ Host skipped a ${spec.name.toLowerCase()} step`
    case "cleared":
      return `${spec.emoji} ${spec.name} cleared`
  }
}

/** Coins each traveler paid across every fund step and the parts they installed, biggest spender first. */
function travelerRows(
  funds: FundEntry[],
  log: TripLogEntry[],
): { name: string; amount: number; parts: string[] }[] {
  const rows = new Map<string, { name: string; amount: number; parts: string[] }>()
  const row = (userId: string, name: string) => {
    const entry = rows.get(userId) ?? { name, amount: 0, parts: [] }
    entry.name = name
    rows.set(userId, entry)
    return entry
  }
  for (const fund of funds) {
    for (const payment of fund.paid ?? []) row(payment.userId, payment.name).amount += payment.amount
  }
  for (const entry of log) {
    if (entry.kind !== "part-installed") continue
    row(entry.userId, entry.name).parts.push(vanPart(entry.partId)?.name ?? entry.partId)
  }
  return Array.from(rows.values()).sort(
    (a, b) => b.amount - a.amount || a.name.localeCompare(b.name),
  )
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
