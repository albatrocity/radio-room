import type { MyPollVote, Poll, PollHistoryEntry } from "./Poll"

/**
 * Poll-related fields on the socket INIT payload after login.
 *
 * The web client's full `InitPayload` (apps/web) will include these fields;
 * server `AuthService.login()` initData is extended in Phase 5.
 */
export type InitPayload = {
  activePoll?: Poll | null
  myVote?: MyPollVote | null
  pollHistory?: PollHistoryEntry[]
}
