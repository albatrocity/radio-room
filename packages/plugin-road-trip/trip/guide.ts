import { isSecretSite, tripGuideItem, type TripLayer, type TripMap } from "@repo/road-trip-map"
import { flow } from "./flow"
import { ARRIVAL_MILE_EPSILON, type Transition, type TransitionContext } from "./helpers"
import type { TripState } from "./state"

/**
 * Trip knowledge items (ADR 0222): Local Map unlocks the next locked layer
 * that lists it (authored order); Trip Guide reveals every unrevealed site
 * ahead that isn't secret-until-revealed. Each is spent only if it changes
 * something.
 */

type Traveler = { userId: string; name: string }

/** The first locked layer, in authored order, whose `unlockItems` lists `shortId`. */
export function nextLockedLayer(
  state: TripState,
  map: TripMap,
  shortId: string,
): TripLayer | undefined {
  return (map.layers ?? []).find(
    (layer) =>
      layer.unlockItems?.includes(shortId) &&
      (state.layers[layer.id]?.phase ?? "locked") === "locked",
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

export function unlockNextLayer(shortId: string, user: Traveler): Transition {
  return (state, ctx) => {
    if (state.status !== "loaded" && state.status !== "driving") return null
    const layer = nextLockedLayer(state, ctx.source, shortId)
    if (!layer) return null
    const acc = flow({ next: state, log: [], effects: [] }, ctx, {
      type: "LAYER_UNLOCK",
      layerId: layer.id,
      by: { kind: "item", shortId, userId: user.userId, name: user.name },
    })
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
