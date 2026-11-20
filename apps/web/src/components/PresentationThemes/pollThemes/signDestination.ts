import type { TripStoreSite, TripStoreSiteState } from "@repo/road-trip-map"

const SITE_STATES = new Set<TripStoreSiteState>([
  "unrevealed",
  "ahead",
  "polling",
  "stopping",
  "parked",
  "skipped",
  "visited",
])

export type SignDestination = { id: string; name: string }

type NamedSite = Pick<TripStoreSite, "id" | "name" | "state">

/**
 * The trip site a pull-off poll's `presentation.subjectId` points at, when the
 * store has revealed it. A mystery poll omits the id, and an unrevealed site
 * has no name here, so the sign stays inert (ADR 0229).
 */
export function signDestination(
  sites: readonly NamedSite[],
  subjectId: string | null | undefined,
): SignDestination | null {
  const id = subjectId?.trim()
  if (!id) return null
  const site = sites.find((candidate) => candidate.id === id)
  if (!site?.name || site.state === "unrevealed") return null
  return { id: site.id, name: site.name }
}

/** Sites on the road-trip `trip` store payload, ignoring anything malformed. */
export function namedTripSites(store: Record<string, unknown> | undefined): NamedSite[] {
  const trip = store?.trip
  if (!trip || typeof trip !== "object" || !("sites" in trip)) return []
  const sites = (trip as { sites?: unknown }).sites
  if (!Array.isArray(sites)) return []
  const named: NamedSite[] = []
  for (const site of sites) {
    if (!site || typeof site !== "object") continue
    const row = site as { id?: unknown; name?: unknown; state?: unknown }
    if (typeof row.id !== "string" || typeof row.state !== "string") continue
    if (!SITE_STATES.has(row.state as TripStoreSiteState)) continue
    named.push({
      id: row.id,
      state: row.state as TripStoreSiteState,
      ...(typeof row.name === "string" ? { name: row.name } : {}),
    })
  }
  return named
}

/** Stable selector snapshot: empty when the sign has no destination to open. */
export function signDestinationKey(
  store: Record<string, unknown> | undefined,
  subjectId: string | null | undefined,
): string {
  const destination = signDestination(namedTripSites(store), subjectId)
  return destination ? `${destination.id}\0${destination.name}` : ""
}

export function parseSignDestinationKey(key: string): SignDestination | null {
  const split = key.indexOf("\0")
  if (split <= 0) return null
  const id = key.slice(0, split)
  const name = key.slice(split + 1)
  if (!id || !name) return null
  return { id, name }
}
