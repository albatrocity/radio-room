import type { TripOutcome } from "@repo/road-trip-map"

/**
 * The trip flow's vocabulary (ADR 0222): everything that can happen to a
 * trip's machines. Thresholds, poll closes, items, outcomes, and host actions
 * all become one of these, and `dispatch` routes each to its entity. Add a
 * member here before anything else.
 */

export type VoteTarget =
  | { kind: "site"; id: string }
  | { kind: "junction"; id: string }
  /** The active incident's current choice step. */
  | { kind: "choice"; incidentId: string; step: number }

/** Poll counts by option order (the I/O layer maps option ids to positions). */
export type VoteTally = number[]

/** Who applied an outcome, for logs and signs. */
export type OutcomeSource =
  | { kind: "site"; id: string }
  | { kind: "event"; id: string }
  | { kind: "choice"; eventId: string; optionId: string }
  | { kind: "item"; shortId: string; userId: string; name: string }
  /** The host (Game Studio's simulator; a future Quick Access control). */
  | { kind: "host" }

/** Who put a key item in the van (ADR 0230): an outcome, or a traveler who bought it. */
export type KeyItemSource = OutcomeSource | { kind: "purchase"; userId: string; name: string }

export type TripFlowEvent =
  // Trip lifecycle
  | { type: "TRIP_DEPART" }
  | { type: "TRIP_ARRIVE"; siteId: string }
  | { type: "TRIP_END" }
  // Sites
  | { type: "SITE_REVEAL"; siteId: string; reason?: "threshold" | "guide" }
  /** `afterDecision`: the re-check after an arrival decided an undecided exit. */
  | { type: "SITE_ARRIVE"; siteId: string; afterDecision?: true }
  /** The site's exit vote opened or closed undecided (from the vote entity). */
  | { type: "SITE_POLL"; siteId: string; open: boolean }
  /** The stop ends (park timer, trip end, or the incident at a Mechanic clears). */
  | { type: "SITE_LEAVE"; siteId: string }
  | {
      type: "SITE_DECIDE"
      siteId: string
      decision: "stop" | "skip"
      votes?: { stop: number; skip: number }
      defaulted: boolean
    }
  | { type: "SITE_BYPASS"; siteId: string; reason: "route" | "missed" }
  | { type: "SITE_TOW_PAST"; siteId: string }
  | { type: "SITE_TOWED_IN"; siteId: string }
  // Junctions and routes
  /**
   * The van reaches a fork. `afterDecision`: the re-check after reaching an
   * undecided fork decided it. `towed`: passed on the hook, at the tow's arrival.
   */
  | { type: "JUNCTION_REACH"; routeId: string; afterDecision?: true; towed?: true }
  | { type: "JUNCTION_POLL"; routeId: string; open: boolean }
  | {
      type: "JUNCTION_DECIDE"
      routeId: string
      decision: "take" | "stay"
      votes?: [number, number]
      defaulted: boolean
    }
  /** A tow is about to carry the van past this fork: settle it first. */
  | { type: "JUNCTION_TOW_SETTLE"; routeId: string }
  | { type: "DIVERT"; routeId: string; by: OutcomeSource }
  /** The van reached the end of an alternate route that rejoins another (`towed`: on the hook). */
  | { type: "ROUTE_END"; routeId: string; towed?: true }
  // Layers
  | { type: "LAYER_UNLOCK"; layerId: string; by: OutcomeSource }
  | { type: "LAYER_LOCK"; layerId: string; by: OutcomeSource }
  // The van's key items and item handouts (ADR 0230)
  /** Put a key item in the van. `narrative` posts instead of the key's `foundNarrative`. */
  | { type: "KEY_GIVE"; key: string; by: KeyItemSource; narrative?: string }
  | { type: "KEY_TAKE"; key: string; by: OutcomeSource }
  /** Hand an inventory item to every online traveler, or one at random (the plugin picks). */
  | {
      type: "ITEMS_GIVE"
      item: string
      to: "everyone" | "random"
      qty: number
      by: OutcomeSource
    }
  // Votes (target-agnostic)
  | { type: "VOTE_OPENED"; target: VoteTarget; pollId: string; optionIds: string[] }
  | { type: "VOTE_DEFERRED"; target: VoteTarget; retryAt: number }
  /**
   * The vote closes. `tally` absent = no poll ran (the default wins). Without
   * `pollId` it also closes an open poll (arrival, tow, timeout).
   */
  | { type: "VOTE_CLOSED"; target: VoteTarget; pollId?: string; tally?: VoteTally }
  /** Close an open poll without a decision (trip end, tow, layer lock). */
  | { type: "VOTE_CANCEL"; target: VoteTarget }
  // Event choices (handled by the incident sequencer)
  | {
      type: "CHOICE_DECIDED"
      incidentId: string
      step: number
      winner: string
      votes?: number[]
      defaulted: boolean
    }
  // Outcomes (expanded by outcomes.ts)
  | { type: "APPLY_OUTCOMES"; outcomes: readonly TripOutcome[]; source: OutcomeSource }

export type TripFlowEventType = TripFlowEvent["type"]

export function sameTarget(a: VoteTarget, b: VoteTarget): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === "choice" && b.kind === "choice") {
    return a.incidentId === b.incidentId && a.step === b.step
  }
  return (a as { id: string }).id === (b as { id: string }).id
}

/** One line per flow event, for the generated docs (exhaustive: a new event needs a line). */
export const FLOW_EVENT_DOCS: Record<TripFlowEventType, string> = {
  TRIP_DEPART: "Host departs.",
  TRIP_ARRIVE:
    "The destination site finished arriving; the trip arrives (late after the deadline).",
  TRIP_END: "Host ends the trip (stranded while driving).",
  SITE_REVEAL: "A reveal threshold or a Trip Guide names a site (data only, no move).",
  SITE_ARRIVE:
    "The van reaches a site: an undecided exit's vote closes first, then it parks or passes.",
  SITE_POLL: "The site's vote opened or closed undecided.",
  SITE_LEAVE: "A stop ends (park timer, trip end, the Mechanic's incident clears).",
  SITE_DECIDE: "The exit vote's winner: stop or skip.",
  SITE_BYPASS: "A rejoin skipped it, or its layer unlocked after the van passed.",
  SITE_TOW_PAST: "A tow carries the van past it.",
  SITE_TOWED_IN: "A tow arrives at this Mechanic.",
  JUNCTION_REACH:
    "The van reaches a fork: an undecided vote closes first, then it turns or passes.",
  JUNCTION_POLL: "The junction's vote opened or closed undecided.",
  JUNCTION_DECIDE: "The junction vote's winner: take or stay.",
  JUNCTION_TOW_SETTLE:
    "A tow is about to pass this fork: an open vote resolves, an unpolled fork passes.",
  DIVERT: "A divert outcome takes a fork ahead.",
  ROUTE_END: "The van reaches the end of a rejoining route; it continues on the target route.",
  LAYER_UNLOCK: "An unlock outcome or one of the trip's maps; content behind the van is missed.",
  LAYER_LOCK: "A lock outcome; open votes on its content cancel, commitments carry on.",
  KEY_GIVE:
    "A give-key outcome (or a bought key): it lands in the van with its found narrative; a held key stays put.",
  KEY_TAKE: "A take-key outcome: the key leaves the van.",
  ITEMS_GIVE:
    "A give-item outcome: the plugin hands the item to every online traveler, or one at random.",
  VOTE_OPENED: "The plugin opened the room poll.",
  VOTE_DEFERRED: "Another poll holds the room; retry later.",
  VOTE_CLOSED: "The vote closes with a tally, or with no poll (the default wins).",
  VOTE_CANCEL: "The poll closes without a decision.",
  CHOICE_DECIDED:
    "An event choice's winner: its outcomes and narrative apply, then the step advances.",
  APPLY_OUTCOMES:
    "Expanded by outcomes.ts: each outcome whose `when` held as the list started becomes LAYER_UNLOCK, LAYER_LOCK, DIVERT, KEY_GIVE, KEY_TAKE, or ITEMS_GIVE.",
}
