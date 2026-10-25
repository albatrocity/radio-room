import type { TripStore, TripStoreLive, TripStoreSite } from "@repo/road-trip-map"
import { FUND_PURPOSE_LABELS, vanConsumable, vanPart } from "@repo/road-trip-map"
import { formatCountdown } from "./formatCountdown"

export function nextSiteAhead(trip: TripStore, mile: number): TripStoreSite | undefined {
  return trip.sites.find(
    (site) => site.mile > mile && site.state !== "skipped" && site.state !== "visited",
  )
}

/** What the van is doing, for the strip's status word and its motion flourishes. */
export type VanPhase = "ready" | "cruising" | "exiting" | "parked" | "held" | "arrived" | "ended"

export const VAN_PHASE_LABEL: Record<VanPhase, string> = {
  ready: "Ready",
  cruising: "Cruising",
  exiting: "Exiting",
  parked: "Parked",
  held: "Stopped",
  arrived: "Arrived",
  ended: "Ended",
}

export function vanPhase(trip: TripStore, mile: number): VanPhase {
  if (trip.status === "loaded") return "ready"
  if (trip.status === "arrived" || trip.status === "late") return "arrived"
  if (trip.status === "ended" || trip.status === "stranded") return "ended"
  if (trip.live?.kind === "parked") return "parked"
  if (trip.van.mph > 0) {
    return nextSiteAhead(trip, mile)?.state === "stopping" ? "exiting" : "cruising"
  }
  return "held"
}

export function siteLabel(site: TripStoreSite): string {
  return site.state === "unrevealed" ? "?" : (site.name ?? "?")
}

const MS_PER_HOUR = 3_600_000

/** Milliseconds of driving to `site` at the current speed, or null when stopped. */
export function msToSite(trip: TripStore, site: TripStoreSite, mile: number): number | null {
  if (trip.van.mph <= 0 || site.mile <= mile) return null
  return ((site.mile - mile) / trip.van.mph) * MS_PER_HOUR
}

/** `m:ss` under an hour, `h:mm:ss` beyond, rounded up so it never reads 0:00 early. */
export function formatDriveCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  if (hours === 0) return `${minutes}:${seconds}`
  return `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
}

/** "road-trip:fix-a-flat" → "Fix-a-Flat". */
export function vanItemName(definitionId: string): string {
  const shortId = definitionId.split(":").pop() ?? definitionId
  return vanConsumable(shortId)?.name ?? vanPart(shortId)?.name ?? shortId
}

function fundIcon(purpose: Extract<TripStoreLive, { kind: "fund" }>["purpose"]): string {
  return purpose === "gas" || purpose === "delivery" ? "⛽" : "🧾"
}

type FundLive = Extract<TripStoreLive, { kind: "fund" }>

/**
 * The live cases the strip sentence and the strip columns both describe.
 * A new `TripStoreLive` kind has to be classified here; each formatter then
 * spells it in its own words.
 */
export type LiveHold =
  | {
      kind: "fund"
      icon: string
      purpose: FundLive["purpose"]
      mode: FundLive["mode"]
      label: string
      cost: number
      raised: number | undefined
      endsAt: number
    }
  | {
      kind: "incident"
      icon: string
      name: string
      fixName?: string
      endsAt?: number
    }
  | {
      kind: "parked"
      label: string
      shopOpen: boolean
      endsAt: number
    }

/** Fund, incident, and parked. A pause stays on `trip.live` for each formatter. */
export function liveHold(trip: TripStore): LiveHold | null {
  const live = trip.live
  if (!live) return null
  switch (live.kind) {
    case "fund":
      return {
        kind: "fund",
        icon: fundIcon(live.purpose),
        purpose: live.purpose,
        mode: live.mode,
        label: live.label,
        cost: live.cost,
        raised: live.raised,
        endsAt: live.endsAt,
      }
    case "incident": {
      const fix = live.resolvesWith?.[0]
      return {
        kind: "incident",
        icon: live.icon,
        name: live.name,
        ...(fix ? { fixName: vanItemName(fix) } : {}),
        ...(live.endsAt !== undefined ? { endsAt: live.endsAt } : {}),
      }
    }
    case "parked":
      return {
        kind: "parked",
        label: live.label,
        shopOpen: live.shopOpen,
        endsAt: live.endsAt,
      }
    case "paused":
      return null
  }
}

function speedLabel(trip: TripStore): string {
  return `${Math.round(trip.van.mph)} mph`
}

function revealedName(site: TripStoreSite | undefined): string | undefined {
  return site && site.state !== "unrevealed" ? site.name : undefined
}

function holdContext(hold: LiveHold, now: number): string {
  switch (hold.kind) {
    case "fund": {
      const left = formatCountdown(hold.endsAt - now)
      if (hold.mode === "voluntary") {
        return `${hold.icon} ${FUND_PURPOSE_LABELS[hold.purpose]} pool ${hold.raised ?? 0}/${hold.cost} · Chip in · ${left}`
      }
      return hold.purpose === "gas"
        ? `⛽ Pumping gas · ${hold.cost} coins`
        : `${hold.icon} ${hold.label} · ${hold.cost} coins`
    }
    case "incident": {
      const left = hold.endsAt !== undefined ? ` · ${formatCountdown(hold.endsAt - now)}` : ""
      return `${hold.icon} ${hold.name}${hold.fixName ? ` · ${hold.fixName}?` : ""}${left}`
    }
    case "parked": {
      const left = formatCountdown(hold.endsAt - now)
      return hold.shopOpen
        ? `Parked · ${hold.label} · shop open ${left}`
        : `Parked · ${hold.label} · back on the road in ${left}`
    }
  }
}

/** The strip's second row: `status | destination | countdown`. */
export type StripReadout = {
  status: string
  destination?: string
  countdown?: string
}

function holdReadout(trip: TripStore, hold: LiveHold, now: number): StripReadout {
  switch (hold.kind) {
    case "fund": {
      if (hold.mode === "voluntary") {
        return {
          status: `${hold.icon} ${FUND_PURPOSE_LABELS[hold.purpose]} pool ${hold.raised ?? 0}/${hold.cost}`,
          destination: "Chip in",
          countdown: formatDriveCountdown(hold.endsAt - now),
        }
      }
      return {
        status: hold.purpose === "gas" ? "⛽ Pumping gas" : `${hold.icon} ${hold.label}`,
        destination: `${hold.cost} coins`,
      }
    }
    case "incident": {
      const destination =
        trip.van.mph > 0 ? speedLabel(trip) : hold.fixName ? `${hold.fixName}?` : undefined
      return {
        status: `${hold.icon} ${hold.name}`,
        ...(destination ? { destination } : {}),
        ...(hold.endsAt !== undefined ? { countdown: formatDriveCountdown(hold.endsAt - now) } : {}),
      }
    }
    case "parked":
      return {
        status: VAN_PHASE_LABEL.parked,
        destination: hold.shopOpen ? `${hold.label} · shop open` : hold.label,
        countdown: formatDriveCountdown(hold.endsAt - now),
      }
  }
}

/** One-line strip context: live state first, then the next site (M7). */
export function stripContext(trip: TripStore, mile: number, now: number): string {
  const hold = liveHold(trip)
  if (hold) return holdContext(hold, now)
  if (trip.live?.kind === "paused") return `Paused · ${trip.live.label}`
  if (trip.status === "loaded") return `Ready to leave · ${trip.mapTitle}`
  if (trip.status === "arrived" || trip.status === "late") {
    const destination = trip.sites.find((s) => s.destination)
    return `Arrived${destination?.name ? ` · ${destination.name}` : ""}`
  }
  if (trip.status === "ended" || trip.status === "stranded") return "Trip ended"
  const next = nextSiteAhead(trip, mile)
  if (!next) return trip.mapTitle
  const ms = msToSite(trip, next, mile)
  return `Next: ${siteLabel(next)}${ms !== null ? ` · ${formatDriveCountdown(ms)}` : ""}`
}

/**
 * Live incidents and funds keep their headline whatever the van is doing
 * (a tow still rolls); otherwise the word comes from `phase`. Parked copy
 * follows the phase so an overridden phase still wins.
 */
export function stripReadout(
  trip: TripStore,
  mile: number,
  now: number,
  phase: VanPhase = vanPhase(trip, mile),
): StripReadout {
  const hold = liveHold(trip)
  if (hold?.kind === "fund" || hold?.kind === "incident") return holdReadout(trip, hold, now)
  switch (phase) {
    case "parked": {
      if (hold?.kind !== "parked") return { status: VAN_PHASE_LABEL.parked }
      return holdReadout(trip, hold, now)
    }
    case "cruising":
    case "exiting": {
      const next = nextSiteAhead(trip, mile)
      const ms = next ? msToSite(trip, next, mile) : null
      const destination = revealedName(next)
      if (!destination && phase === "cruising") {
        return { status: VAN_PHASE_LABEL.cruising, destination: speedLabel(trip) }
      }
      return {
        status: VAN_PHASE_LABEL[phase],
        ...(destination ? { destination } : {}),
        ...(ms !== null ? { countdown: formatDriveCountdown(ms) } : {}),
      }
    }
    case "held":
      if (trip.live?.kind === "paused") {
        return trip.live.label === "Paused"
          ? { status: "Paused" }
          : { status: "Paused", destination: trip.live.label }
      }
      return { status: VAN_PHASE_LABEL.held }
    case "ready":
      return { status: VAN_PHASE_LABEL.ready, destination: trip.mapTitle }
    case "arrived": {
      const destination = revealedName(trip.sites.find((s) => s.destination))
      return { status: VAN_PHASE_LABEL.arrived, ...(destination ? { destination } : {}) }
    }
    case "ended":
      return { status: VAN_PHASE_LABEL.ended }
  }
}
