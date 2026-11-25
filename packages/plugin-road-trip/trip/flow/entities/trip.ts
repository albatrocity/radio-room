import { parkPlan, resolveSiteSettings } from "@repo/road-trip-map"
import { findSite, milesLabel, narrate, narrativeSounds, type TripEffect } from "../../helpers"
import { closeOpenWork } from "../../stops"
import type { FlowAcc, FlowEntity } from "../dispatch"
import { tripMachine, type TripMachineEvent, type TripPhase } from "../machines"

/**
 * The trip's lifecycle (ADR 0222): departure, arrival (on time or late), and
 * the host ending it. Pauses, stops, and incidents are blockers, not phases.
 */

const TRIP_ID = "trip"

function sign(acc: FlowAcc, effect: TripEffect): FlowAcc {
  return { ...acc, effects: [...acc.effects, effect] }
}

export const tripEntity: FlowEntity<TripPhase, TripMachineEvent> = {
  machine: tripMachine,
  handles: ["TRIP_DEPART", "TRIP_ARRIVE", "TRIP_END"],
  target: () => TRIP_ID,
  read: (state) => state.status,
  write: (state, _id, phase) => ({ ...state, status: phase }),
  interpret: (event, _id, state, ctx) => {
    switch (event.type) {
      case "TRIP_DEPART":
        return { type: "DEPART" }
      case "TRIP_ARRIVE": {
        const deadline = ctx.map.route.deadlineAt
        const late = deadline !== undefined && ctx.now > Date.parse(deadline)
        return { type: late ? "ARRIVE_LATE" : "ARRIVE" }
      }
      case "TRIP_END":
        return state.status === "driving" ? { type: "STRAND" } : { type: "END" }
      default:
        return null
    }
  },
  onEnter: {
    driving: (acc, { ctx, emit }) => {
      const { map, now } = ctx
      const deadline = map.route.deadlineAt ? Date.parse(map.route.deadlineAt) : undefined
      const state = acc.next
      const departed: FlowAcc = {
        next: {
          ...state,
          departedAt: now,
          // Drive time plus the stops expected if nobody votes, so a fresh trip reads "On target".
          targetArrivalAt:
            deadline ?? now + map.route.driveMinutes * 60_000 + parkPlan(map).expectedMs,
          blockers: state.blockers.filter((b) => b.kind !== "admin-pause"),
        },
        log: [...acc.log, { kind: "departed" }],
        effects: [
          ...acc.effects,
          {
            type: "sign",
            variant: "info",
            icon: "🚐",
            title: `On the road · ${map.title}`,
            body: `${milesLabel(state.routeMiles)} to go.`,
          },
          ...narrativeSounds(map, "departure"),
        ],
      }
      const startReveals = map.sites.filter((site) => {
        const { revealMiles } = resolveSiteSettings(map, site)
        return revealMiles > 0 && site.mile - revealMiles <= 0
      })
      return emit(
        departed,
        ...startReveals.map((site) => ({ type: "SITE_REVEAL" as const, siteId: site.id })),
      )
    },
    arrived: (acc, args) => arrive(acc, args, false),
    late: (acc, args) => arrive(acc, args, true),
    stranded: (acc, { ctx, emit }) => {
      const closed = closeOpenWork(acc, emit)
      return sign(
        {
          ...closed,
          next: { ...closed.next, endedAt: ctx.now },
          log: [...closed.log, { kind: "stranded" }],
        },
        {
          type: "sign",
          variant: "warning",
          icon: "🛑",
          title: "Trip ended",
          body: "The van never made it. Maybe next time.",
        },
      )
    },
    ended: (acc, { ctx, emit }) => {
      const closed = closeOpenWork(acc, emit)
      return sign(
        {
          ...closed,
          next: { ...closed.next, endedAt: ctx.now },
          log: [...closed.log, { kind: "ended" }],
        },
        { type: "sign", variant: "info", icon: "🏁", title: "Trip complete" },
      )
    },
  },
}

function arrive(
  acc: FlowAcc,
  {
    ctx,
    event,
    emit,
  }: Parameters<NonNullable<NonNullable<typeof tripEntity.onEnter>["arrived"]>>[1],
  late: boolean,
): FlowAcc {
  if (event.type !== "TRIP_ARRIVE") return acc
  const site = findSite(ctx.map, event.siteId)
  const deadline = ctx.map.route.deadlineAt
  const closed = closeOpenWork(acc, emit)
  const narrative = site ? narrate(site, acc.next.sites[site.id]?.narrativeCase) : null
  return {
    next: { ...closed.next, arrivedAt: ctx.now },
    log: [...closed.log, late ? { kind: "late", deadlineAt: deadline } : { kind: "arrived" }],
    effects: [
      ...closed.effects,
      ...(site
        ? [
            {
              type: "sign" as const,
              variant: late ? ("warning" as const) : ("info" as const),
              icon: site.icon,
              title: late ? `Made it to ${site.name} · late` : `Made it to ${site.name}`,
              body: site.description,
            },
          ]
        : []),
      ...(narrative ? [narrative] : []),
      ...(site ? narrativeSounds(site, "arrival") : []),
      { type: "nudge-host" },
    ],
  }
}
