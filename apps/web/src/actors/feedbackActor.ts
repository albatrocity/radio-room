/**
 * Feedback Actor — room-scoped topics, my responses, admin inbox (ADR 0145).
 */

import { createActor } from "xstate"
import { feedbackMachine } from "../machines/feedbackMachine"

export const feedbackActor = createActor(feedbackMachine).start()

export function getFeedbackTopics() {
  return feedbackActor.getSnapshot().context.topics
}

export function getMyFeedbackResponses() {
  return feedbackActor.getSnapshot().context.myResponses
}

export function getFeedbackInbox() {
  return feedbackActor.getSnapshot().context.inbox
}
