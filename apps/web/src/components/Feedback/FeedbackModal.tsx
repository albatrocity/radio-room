import { useEffect } from "react"
import { Separator, Stack, Text, VStack } from "@chakra-ui/react"
import { GENERAL_FEEDBACK_TOPIC_ID } from "@repo/types"
import Modal from "../Modal"
import { FeedbackTopicRow } from "./FeedbackTopicRow"
import {
  useFeedbackSend,
  useFeedbackTopics,
  useIsModalOpen,
  useModalsSend,
  useMyFeedbackResponses,
} from "../../hooks/useActors"

const GENERAL_TOPIC = {
  id: GENERAL_FEEDBACK_TOPIC_ID,
  title: "General feedback",
  description: "Bugs, ideas, or anything else",
} as const

export default function FeedbackModal() {
  const modalSend = useModalsSend()
  const feedbackSend = useFeedbackSend()
  const isOpen = useIsModalOpen("feedback")
  const topics = useFeedbackTopics()
  const myResponses = useMyFeedbackResponses()

  useEffect(() => {
    if (isOpen) {
      feedbackSend({ type: "MARK_SURFACE_VIEWED" })
    }
  }, [isOpen, feedbackSend])

  return (
    <Modal
      open={isOpen}
      onClose={() => modalSend({ type: "CLOSE_FEEDBACK" })}
      heading="Feedback"
      contentProps={{ maxW: "lg" }}
    >
      <VStack align="stretch" gap={4} py={2}>
        <Text fontSize="sm" color="fg.muted">
          Optional feedback on features in this room. Your responses are private to you and room
          admins.
        </Text>
        <Stack gap={3}>
          {topics.map((topic) => (
            <FeedbackTopicRow key={topic.id} topic={topic} response={myResponses[topic.id]} />
          ))}
        </Stack>
        {topics.length > 0 ? <Separator /> : null}
        <FeedbackTopicRow
          topic={GENERAL_TOPIC}
          response={myResponses[GENERAL_FEEDBACK_TOPIC_ID]}
          allowCommentWithoutVote
        />
      </VStack>
    </Modal>
  )
}
