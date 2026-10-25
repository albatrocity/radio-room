import { choiceDecidedHandler } from "../incidents"
import { registerFlow } from "./dispatch"
import { routeEndHandler } from "./entities/anchor"
import { junctionEntity } from "./entities/junction"
import { layerEntity } from "./entities/layer"
import { siteEntity } from "./entities/site"
import { tripEntity } from "./entities/trip"
import { voteEntity } from "./entities/vote"
import { applyOutcomesHandler } from "./outcomes"

/**
 * The trip flow (ADR 0222): the only import surface for the rest of the
 * plugin. Every machine move goes through `dispatch`/`flow`; see
 * `docs/road-trip-flow.md` (generated from `machines.ts`).
 */

registerFlow(() => ({
  entities: [tripEntity, siteEntity, voteEntity, junctionEntity, layerEntity],
  handlers: {
    APPLY_OUTCOMES: applyOutcomesHandler,
    ROUTE_END: routeEndHandler,
    CHOICE_DECIDED: choiceDecidedHandler,
  },
}))

export { absorb, dispatch, flow, MAX_FLOW_EVENTS, FlowOverflowError } from "./dispatch"
export type { Emit, FlowAcc, FlowEntity, FlowHandler } from "./dispatch"
export type { OutcomeSource, TripFlowEvent, VoteTally, VoteTarget } from "./events"
export { sameTarget } from "./events"
export { flowView, pathFor, refresh } from "./view"
export {
  choiceFor,
  decide,
  findVoteByPoll,
  openVoteTargets,
  targetKey,
  VOTE_SPECS,
  type VotePrompt,
} from "./entities/vote"
export { currentLeg, routeName } from "./entities/anchor"
export { outcomeEvents } from "./outcomes"
export * from "./machines"
export { send, toMermaid, reachableStates, moves, defineMachine } from "./machine"
