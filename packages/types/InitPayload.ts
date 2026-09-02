import type { MyPollVote, Poll, PollHistoryEntry } from "./Poll"
import type { FeedbackResponse, FeedbackTopic } from "./Feedback"

/**
 * Poll- and feedback-related fields on the socket INIT payload after login.
 *
 * The web client's full `InitPayload` (apps/web) includes these fields;
 * server `AuthService.login()` hydrates them via `buildRoomInitPayload`.
 */
export type InitPayload = {
  activePoll?: Poll | null
  myVote?: MyPollVote | null
  pollHistory?: PollHistoryEntry[]
  /** Active admin-authored topics (excludes sentinel general). */
  feedbackTopics?: FeedbackTopic[]
  /** Current user's responses keyed by topicId (includes general if answered). */
  myFeedbackResponses?: Record<string, FeedbackResponse>
}
