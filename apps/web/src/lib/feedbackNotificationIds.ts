/** Stable notification ids for feedback topics and admin inbox (ADR 0145). */

export function feedbackTopicNotificationId(topicId: string): string {
  return `feedback-topic-${topicId}`
}

export function feedbackInboxNotificationId(topicId: string, userId: string): string {
  return `feedback-inbox-${topicId}-${userId}`
}
