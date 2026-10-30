import { mileEvents, tripGuideItem, tripMapForItem, type TripLayer } from "@repo/road-trip-map"
import { ARRIVAL_MILE_EPSILON, type TransitionContext, type TripEffect } from "../../helpers"
import type { LayerRuntime } from "../../state"
import type { FlowAcc, FlowEntity } from "../dispatch"
import type { OutcomeSource, TripFlowEvent } from "../events"
import { layerMachine, type LayerMachineEvent, type LayerPhase } from "../machines"

/**
 * A layer's lifecycle (ADR 0222): a named group of sites and events, inert
 * until unlocked. Unlocking marks content already behind the van as missed, so
 * nothing fires all at once; locking keeps commitments (a decided stop, a
 * running event) and cancels open votes on the rest.
 */

function layerOf(ctx: TransitionContext, id: string): TripLayer | undefined {
  return ctx.source.layers?.find((layer) => layer.id === id)
}

function layerIdOf(event: TripFlowEvent): string | null {
  return "layerId" in event ? event.layerId : null
}

function byLabel(by: OutcomeSource): string {
  switch (by.kind) {
    case "item":
      return `item:${by.shortId}:${by.userId}`
    case "choice":
      return `choice:${by.eventId}:${by.optionId}`
    case "host":
      return "host"
    default:
      return `${by.kind}:${by.id}`
  }
}

function sign(
  ctx: TransitionContext,
  layer: TripLayer,
  by: OutcomeSource,
  unlocked: boolean,
): TripEffect {
  const fallback = unlocked ? "New stops are on the map." : "Those stops are off the map."
  const narrative = (unlocked ? layer.unlockedNarrative : layer.lockedNarrative)?.trim() || fallback
  const item =
    by.kind === "item"
      ? (tripMapForItem(ctx.source, by.shortId) ?? tripGuideItem(by.shortId))
      : undefined
  return {
    type: "sign",
    variant: unlocked ? "success" : "info",
    icon: layer.icon,
    title: unlocked ? layer.name : `${layer.name} · closed`,
    body: by.kind === "item" && item ? `${by.name} used the ${item.name}. ${narrative}` : narrative,
  }
}

function patchLayer(acc: FlowAcc, id: string, patch: Partial<LayerRuntime>): FlowAcc {
  const runtime = acc.next.layers[id]
  if (!runtime) return acc
  return {
    ...acc,
    next: { ...acc.next, layers: { ...acc.next.layers, [id]: { ...runtime, ...patch } } },
  }
}

export const layerEntity: FlowEntity<LayerPhase, LayerMachineEvent> = {
  machine: layerMachine,
  handles: ["LAYER_UNLOCK", "LAYER_LOCK"],
  target: layerIdOf,
  read: (state, id, ctx) => state.layers[id]?.phase ?? (layerOf(ctx, id) ? "locked" : undefined),
  write: (state, id, phase) => ({
    ...state,
    layers: { ...state.layers, [id]: { ...state.layers[id], phase } },
  }),
  interpret: (event, _id, state) => {
    if (state.status !== "loaded" && state.status !== "driving") return null
    if (event.type === "LAYER_UNLOCK") return { type: "UNLOCK" }
    if (event.type === "LAYER_LOCK") return { type: "LOCK" }
    return null
  },
  onEnter: {
    unlocked: (acc, { id, ctx, event, emit }) => {
      if (event.type !== "LAYER_UNLOCK") return acc
      const layer = layerOf(ctx, id)!
      let next = patchLayer(acc, id, { at: ctx.now, by: byLabel(event.by) })
      next = {
        ...next,
        log: [...next.log, { kind: "layer", layerId: id, name: layer.name, phase: "unlocked" }],
        effects: [...next.effects, sign(ctx, layer, event.by, true)],
      }
      // Content the van already passed is missed, not fired late.
      const behind = ctx.mile - ARRIVAL_MILE_EPSILON
      const missedEvents = mileEvents(ctx.map)
        .filter((e) => e.layer === id && e.mile < behind && !next.next.scriptedFired.includes(e.id))
        .map((e) => e.id)
      if (missedEvents.length > 0) {
        next = {
          ...next,
          next: { ...next.next, scriptedFired: [...next.next.scriptedFired, ...missedEvents] },
        }
      }
      const missedSites = ctx.map.sites.filter((site) => site.layer === id && site.mile < behind)
      return emit(
        next,
        ...missedSites.map((site) => ({
          type: "SITE_BYPASS" as const,
          siteId: site.id,
          reason: "missed" as const,
        })),
      )
    },
    locked: (acc, { id, ctx, event, emit }) => {
      if (event.type !== "LAYER_LOCK") return acc
      const layer = layerOf(ctx, id)!
      let next = patchLayer(acc, id, { at: ctx.now, by: byLabel(event.by) })
      next = {
        ...next,
        log: [...next.log, { kind: "layer", layerId: id, name: layer.name, phase: "locked" }],
        effects: [...next.effects, sign(ctx, layer, event.by, false)],
      }
      // Open votes on its content and on forks it gates close undecided.
      const siteVotes = ctx.source.sites
        .filter((site) => site.layer === id && next.next.sites[site.id]?.vote?.phase === "open")
        .map((site) => ({
          type: "VOTE_CANCEL" as const,
          target: { kind: "site" as const, id: site.id },
        }))
      const forkVotes = (ctx.source.routes ?? [])
        .filter(
          (route) => route.layer === id && next.next.junctions[route.id]?.vote?.phase === "open",
        )
        .map((route) => ({
          type: "VOTE_CANCEL" as const,
          target: { kind: "junction" as const, id: route.id },
        }))
      return emit(next, ...siteVotes, ...forkVotes)
    },
  },
}
