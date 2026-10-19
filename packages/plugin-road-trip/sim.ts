/**
 * Browser-safe entry for the Game Studio trip simulator (ADR 0213). Must not
 * import `./index` (the plugin), only the pure trip runtime and presenters.
 */
export {
  TripSimRoom,
  effectToChat,
  freezeStoreForRoom,
  type SimIncidentItem,
  type SimTraveler,
  type TripSimSnapshot,
} from "./trip/simRoom"
export { TripSim, type OpenPoll, type SimEvent, type SimStep } from "./trip/testSim"
export { buildStatusLines, buildTripStore } from "./trip/projection"
export { poolCardView, skipPollPresentation } from "./presenters"
export { PLUGIN_NAME as ROAD_TRIP_PLUGIN_NAME } from "./types"
export type { TripLogEntry, TripState, SkipVotes } from "./trip/state"
export type { TripEffect } from "./trip/transitions"
