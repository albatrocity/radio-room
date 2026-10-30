import {
  isSecretSite,
  layersRevealedBy,
  tripGuideItem,
  tripMapForItem,
  type TripLayer,
  type TripMap,
} from "@repo/road-trip-map"
import { flow } from "./flow"
import { ARRIVAL_MILE_EPSILON, type Transition, type TransitionContext } from "./helpers"
import type { TripState } from "./state"

/**
 * Trip knowledge items: a trip's own maps (ADR 0227) unlock every locked layer
 * that opts into them; Trip Guide (ADR 0222) reveals every unrevealed site
 * ahead that isn't secret-until-revealed. Each is spent only if it changes
 * something.
 */

type Traveler = { userId: string; name: string }

/** The still-locked layers, in authored order, that the map item `shortId` opens. */
export function layersToUnlock(state: TripState, map: TripMap, shortId: string): TripLayer[] {
  const item = tripMapForItem(map, shortId)
  if (!item) return []
  return layersRevealedBy(map, item.id).filter(
    (layer) => (state.layers[layer.id]?.phase ?? "locked") === "locked",
  )
}

/** Site ids a Trip Guide would reveal now: on the path ahead, unrevealed, not secret. */
export function guideRevealTargets(state: TripState, ctx: TransitionContext): string[] {
  return ctx.map.sites
    .filter((site) => {
      const runtime = state.sites[site.id]
      if (!runtime || runtime.revealed || isSecretSite(site)) return false
      if (
        runtime.phase !== "ahead" &&
        runtime.phase !== "polling" &&
        runtime.phase !== "stopping"
      ) {
        return false
      }
      return site.mile > ctx.mile - ARRIVAL_MILE_EPSILON
    })
    .map((site) => site.id)
}

export function openTripMap(shortId: string, user: Traveler): Transition {
  return (state, ctx) => {
    if (state.status !== "loaded" && state.status !== "driving") return null
    const layers = layersToUnlock(state, ctx.source, shortId)
    if (layers.length === 0) return null
    const by = { kind: "item" as const, shortId, userId: user.userId, name: user.name }
    const acc = flow(
      { next: state, log: [], effects: [] },
      ctx,
      ...layers.map((layer) => ({ type: "LAYER_UNLOCK" as const, layerId: layer.id, by })),
    )
    return acc.next === state ? null : acc
  }
}

export function revealAhead(shortId: string, user: Traveler): Transition {
  return (state, ctx) => {
    if (state.status !== "driving") return null
    const targets = guideRevealTargets(state, ctx)
    if (targets.length === 0) return null
    const item = tripGuideItem(shortId)
    const acc = flow(
      {
        next: state,
        log: [],
        effects: [
          {
            type: "sign",
            variant: "success",
            icon: item?.emoji ?? "📘",
            title: `${user.name} opened the ${item?.name ?? "guide"}`,
            body: `${targets.length} stop${targets.length === 1 ? "" : "s"} ahead, by name.`,
          },
        ],
      },
      ctx,
      ...targets.map((siteId) => ({
        type: "SITE_REVEAL" as const,
        siteId,
        reason: "guide" as const,
      })),
    )
    return acc
  }
}
