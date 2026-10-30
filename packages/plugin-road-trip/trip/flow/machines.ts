import { defineMachine } from "./machine"

/**
 * The trip statechart (ADR 0222): one flat table per entity. Pure data: the
 * generated docs (`npm run flow:docs`) and the machine tests read these.
 * Only `flow/entities/*` step them, through `dispatch`.
 */

export type TripPhase = "loaded" | "driving" | "arrived" | "late" | "stranded" | "ended"
export type TripMachineEvent = { type: "DEPART" | "ARRIVE" | "ARRIVE_LATE" | "STRAND" | "END" }

export const tripMachine = defineMachine<TripPhase, TripMachineEvent>({
  id: "trip",
  initial: "loaded",
  states: {
    loaded: { on: { DEPART: "driving" }, description: "Map loaded; the van waits for the host." },
    driving: {
      on: { ARRIVE: "arrived", ARRIVE_LATE: "late", STRAND: "stranded" },
      description: "On the road (pauses, stops, and incidents are blockers, not phases).",
    },
    arrived: { on: { END: "ended" }, description: "Reached the destination on time." },
    late: { on: { END: "ended" }, description: "Reached the destination after the deadline." },
    stranded: { final: true, description: "The host ended the trip before the destination." },
    ended: { final: true, description: "The host closed out an arrived trip." },
  },
  events: {
    DEPART: "Host departs.",
    ARRIVE: "The van reaches the destination before the deadline.",
    ARRIVE_LATE: "The van reaches the destination after the deadline.",
    STRAND: "Host ends the trip while driving.",
    END: "Host ends an arrived trip.",
  },
})

/** `bypassed`: the van can no longer reach it (a route skipped it, or its layer unlocked behind the van). */
export type SitePhase =
  | "ahead"
  | "polling"
  | "stopping"
  | "parked"
  | "visited"
  | "skipped"
  | "bypassed"

export type SiteMachineEvent = {
  type:
    | "POLL_OPENED"
    | "POLL_CANCELLED"
    | "STOP"
    | "SKIP"
    | "PARK"
    | "FINISH"
    | "LEAVE"
    | "TOW_PAST"
    | "TOWED_IN"
    | "BYPASS"
}

export const siteMachine = defineMachine<SitePhase, SiteMachineEvent>({
  id: "site",
  initial: "ahead",
  states: {
    ahead: {
      on: {
        POLL_OPENED: "polling",
        STOP: "stopping",
        SKIP: "skipped",
        TOW_PAST: "skipped",
        TOWED_IN: "parked",
        BYPASS: "bypassed",
      },
      description: "Optional site awaiting its exit vote.",
    },
    polling: {
      on: {
        POLL_CANCELLED: "ahead",
        STOP: "stopping",
        SKIP: "skipped",
        TOW_PAST: "skipped",
        TOWED_IN: "parked",
        BYPASS: "bypassed",
      },
      description: "Exit vote open.",
    },
    stopping: {
      on: {
        PARK: "parked",
        FINISH: "visited",
        TOW_PAST: "skipped",
        TOWED_IN: "parked",
        BYPASS: "bypassed",
      },
      description: "Will park on arrival (mandatory, or the room chose to stop).",
    },
    parked: { on: { LEAVE: "visited" }, description: "The van is parked here." },
    visited: { final: true, description: "Stopped here (or arrived, for the destination)." },
    skipped: {
      on: { TOWED_IN: "parked" },
      description: "Driven or towed past. A tow can still bring the van in to a skipped Mechanic.",
    },
    bypassed: { final: true, description: "Off the van's path for good." },
  },
  events: {
    POLL_OPENED: "The exit vote opened.",
    POLL_CANCELLED: "The exit vote closed undecided (trip ended, tow, layer locked).",
    STOP: "Decided: pull off.",
    SKIP: "Decided: keep driving.",
    PARK: "The van arrives and parks.",
    FINISH: "The van arrives at the destination.",
    LEAVE: "The stop ends.",
    TOW_PAST: "A tow carries the van past it.",
    TOWED_IN: "A tow arrives here (a Mechanic).",
    BYPASS: "A route bypasses it, or its layer unlocked after the van passed.",
  },
})

/** One room poll's lifecycle, for any vote target (site exit, junction, event choice). */
export type VotePhase = "pending" | "open" | "decided"
export type VoteMachineEvent = { type: "OPEN" | "DEFER" | "CANCEL" | "DECIDE" }

export const voteMachine = defineMachine<VotePhase, VoteMachineEvent>({
  id: "vote",
  initial: "pending",
  states: {
    pending: {
      on: { OPEN: "open", DEFER: "pending", DECIDE: "decided" },
      description: "Not open yet (waiting for its lead, or retrying after a 409).",
    },
    open: { on: { CANCEL: "pending", DECIDE: "decided" }, description: "A room poll is open." },
    decided: { final: true, description: "A winner was applied (tally, tie, or default)." },
  },
  events: {
    OPEN: "The room poll opened.",
    DEFER: "Another poll holds the room; retry later.",
    CANCEL: "Closed without a decision.",
    DECIDE: "Closed with a winner (or no poll could run: the default wins).",
  },
})

export type JunctionPhase = "ahead" | "polling" | "take" | "stay" | "taken" | "passed"
export type JunctionMachineEvent = {
  type: "POLL_OPENED" | "POLL_CANCELLED" | "TAKE" | "STAY" | "DIVERT" | "REACH" | "PASS"
}

export const junctionMachine = defineMachine<JunctionPhase, JunctionMachineEvent>({
  id: "junction",
  initial: "ahead",
  states: {
    ahead: {
      on: {
        POLL_OPENED: "polling",
        TAKE: "take",
        STAY: "stay",
        DIVERT: "take",
        PASS: "passed",
      },
      description: "Fork ahead, undecided (paths treat it as stay).",
    },
    polling: {
      on: { POLL_CANCELLED: "ahead", TAKE: "take", STAY: "stay", DIVERT: "take", PASS: "passed" },
      description: "Junction vote open.",
    },
    take: { on: { REACH: "taken" }, description: "Decided: turn onto the route at the fork." },
    stay: {
      on: { REACH: "passed", DIVERT: "take", PASS: "passed" },
      description: "Decided: stay.",
    },
    taken: { final: true, description: "The van turned onto the route." },
    passed: { final: true, description: "The van went past the fork." },
  },
  events: {
    POLL_OPENED: "The junction vote opened.",
    POLL_CANCELLED: "The vote closed undecided (the fork's layer locked).",
    TAKE: "The vote chose the route.",
    STAY: "The vote chose to stay.",
    DIVERT: "A divert outcome takes the route.",
    REACH: "The van reaches the fork.",
    PASS: "Passed undecided (a tow, or the fork was never polled).",
  },
})

export type LayerPhase = "locked" | "unlocked"
export type LayerMachineEvent = { type: "UNLOCK" | "LOCK" }

export const layerMachine = defineMachine<LayerPhase, LayerMachineEvent>({
  id: "layer",
  initial: "locked",
  states: {
    locked: { on: { UNLOCK: "unlocked" }, description: "Its sites and events are inert." },
    unlocked: { on: { LOCK: "locked" }, description: "Its content ahead of the van is live." },
  },
  events: {
    UNLOCK: "An unlock outcome (site visit or departure, event, choice) or a trip map.",
    LOCK: "A lock outcome.",
  },
})

export const TRIP_MACHINES = [
  tripMachine,
  siteMachine,
  voteMachine,
  junctionMachine,
  layerMachine,
] as const
