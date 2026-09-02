import {
  GENERAL_FEEDBACK_TOPIC_ID,
  type AppContext,
  type FeedbackResponse,
  type FeedbackTopic,
} from "@repo/types"
import { getActiveFeedbackTopics, getMyFeedbackResponses } from "../data/feedback"

export async function loadFeedbackInitData({
  context,
  roomId,
  userId,
}: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<{
  feedbackTopics: FeedbackTopic[]
  myFeedbackResponses: Record<string, FeedbackResponse>
}> {
  const feedbackTopics = await getActiveFeedbackTopics({ context, roomId })
  const topicIds = [
    ...feedbackTopics.map((t) => t.id),
    GENERAL_FEEDBACK_TOPIC_ID,
  ]
  const myFeedbackResponses = await getMyFeedbackResponses({
    context,
    roomId,
    userId,
    topicIds,
  })
  return { feedbackTopics, myFeedbackResponses }
}

/** ROOM_DATA always sends the small active topics array (no watermark). */
export async function loadFeedbackRoomData({
  context,
  roomId,
  userId,
}: {
  context: AppContext
  roomId: string
  userId: string
}): Promise<{
  feedbackTopics: FeedbackTopic[]
  myFeedbackResponses: Record<string, FeedbackResponse>
}> {
  return loadFeedbackInitData({ context, roomId, userId })
}
