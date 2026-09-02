import { useEffect, useMemo } from "react"
import {
  Box,
  HStack,
  IconButton,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { useMachine } from "@xstate/react"
import { LuThumbsDown, LuThumbsUp } from "react-icons/lu"
import type { FeedbackResponse, FeedbackTopic, FeedbackVote } from "@repo/types"
import { createFeedbackResponseFormMachine } from "../../machines/feedbackResponseFormMachine"
import { useFeedbackLastFailed, useFeedbackSend } from "../../hooks/useActors"

type Props = {
  topic: Pick<FeedbackTopic, "id" | "title" | "description">
  response?: FeedbackResponse
  /** General feedback: comment box always visible; may save without a vote. */
  allowCommentWithoutVote?: boolean
}

export function FeedbackTopicRow({
  topic,
  response,
  allowCommentWithoutVote = false,
}: Props) {
  const feedbackSend = useFeedbackSend()
  const lastFailed = useFeedbackLastFailed()

  const onSave = useMemo(
    () =>
      (payload: { topicId: string; vote?: FeedbackVote; comment?: string }) => {
        feedbackSend({ type: "SAVE_RESPONSE", data: payload })
      },
    [feedbackSend],
  )

  const machine = useMemo(
    () =>
      createFeedbackResponseFormMachine({
        topicId: topic.id,
        vote: response?.vote ?? null,
        comment: response?.comment ?? "",
        allowCommentWithoutVote,
        onSave,
      }),
    // Recreate only when topic id / mode changes; hydrate handles response sync.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [topic.id, allowCommentWithoutVote, onSave],
  )

  const [state, send] = useMachine(machine)

  useEffect(() => {
    send({
      type: "HYDRATE",
      vote: response?.vote ?? null,
      comment: response?.comment ?? "",
    })
  }, [response?.vote, response?.comment, response?.updatedAt, send])

  useEffect(() => {
    if (lastFailed.topicId === topic.id && lastFailed.at > 0) {
      send({ type: "SAVE_FAILED" })
    }
  }, [lastFailed.topicId, lastFailed.at, topic.id, send])

  useEffect(() => {
    return () => {
      send({ type: "FLUSH" })
    }
  }, [send])

  const vote = state.context.vote
  const comment = state.context.comment
  const showComment = allowCommentWithoutVote || vote != null

  return (
    <Box
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="lg"
      p={4}
      bg="bg.subtle"
    >
      <VStack align="stretch" gap={3}>
        <HStack justify="space-between" align="flex-start" gap={3}>
          <VStack align="start" gap={1} flex="1" minW={0}>
            <Text fontWeight="semibold">{topic.title}</Text>
            {topic.description ? (
              <Text fontSize="sm" color="fg.muted">
                {topic.description}
              </Text>
            ) : null}
          </VStack>
          <HStack gap={1} flexShrink={0}>
            <IconButton
              aria-label="Thumbs up"
              size="sm"
              variant={vote === "up" ? "solid" : "outline"}
              colorPalette={vote === "up" ? "green" : "gray"}
              onClick={() => send({ type: "SET_VOTE", vote: "up" })}
            >
              <LuThumbsUp />
            </IconButton>
            <IconButton
              aria-label="Thumbs down"
              size="sm"
              variant={vote === "down" ? "solid" : "outline"}
              colorPalette={vote === "down" ? "red" : "gray"}
              onClick={() => send({ type: "SET_VOTE", vote: "down" })}
            >
              <LuThumbsDown />
            </IconButton>
          </HStack>
        </HStack>
        {showComment ? (
          <Textarea
            value={comment}
            placeholder={
              allowCommentWithoutVote
                ? "Share feedback…"
                : "Optional comments…"
            }
            rows={3}
            onChange={(e) => send({ type: "SET_COMMENT", comment: e.target.value })}
            onBlur={() => send({ type: "FLUSH" })}
          />
        ) : null}
      </VStack>
    </Box>
  )
}
