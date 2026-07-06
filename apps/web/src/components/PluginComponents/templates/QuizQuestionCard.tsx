import { useEffect, useState } from "react"
import { Badge, Box, HStack, IconButton, Text, VStack } from "@chakra-ui/react"
import { LuBrain, LuMaximize2, LuMinus } from "react-icons/lu"
import { useCurrentUser } from "../../../hooks/useActors"
import { usePluginComponentContext } from "../context"
import type { QuizQuestionCardComponentProps } from "../../../types/PluginComponent"

/** Broadcast-safe question shape (mirrors the plugin's `PublicQuizQuestion`). */
interface ActiveQuestion {
  id: string
  text: string
  index: number
  total: number
  /** Present once the answer is public (PvP correct guess / admin reveal). */
  revealedAnswer?: string
}

/** Last correct-answer notice used to light up the per-user "You got it!" state. */
interface CorrectNotice {
  userId: string
  questionId: string
}

/**
 * Quiz question card — renders the active quiz question above the chat window.
 *
 * State is driven entirely by the plugin store (hydrated by `getComponentState`
 * for late joiners, then updated by `PLUGIN:quiz-sessions:*` events). The card
 * renders nothing when there is no active question.
 *
 * Answer visibility is spoiler-safe:
 * - PvP (competitive): once won, `revealedAnswer` is broadcast to everyone.
 * - PvG (inclusive): no answer is broadcast; each client shows a private
 *   "You got it!" badge derived from `lastCorrectAnswer` matching the current
 *   user, tracked per question id so it survives re-renders and store churn.
 */
export function QuizQuestionCardTemplateComponent({
  questionKey = "activeQuestion",
  lastCorrectKey = "lastCorrectAnswer",
  hint = "Type your answer in chat",
}: QuizQuestionCardComponentProps) {
  const { store } = usePluginComponentContext()
  const currentUser = useCurrentUser()
  const myUserId = currentUser?.userId

  const question = (store[questionKey] as ActiveQuestion | null | undefined) ?? null
  const lastCorrect = (store[lastCorrectKey] as CorrectNotice | null | undefined) ?? null

  const [collapsed, setCollapsed] = useState(false)
  const [answeredQuestionIds, setAnsweredQuestionIds] = useState<Set<string>>(() => new Set())

  // Track the questions the current user has answered correctly. Keyed by
  // question id so a new question naturally resets the indicator.
  useEffect(() => {
    if (!lastCorrect || !myUserId) return
    if (lastCorrect.userId !== myUserId) return
    setAnsweredQuestionIds((prev) => {
      if (prev.has(lastCorrect.questionId)) return prev
      const next = new Set(prev)
      next.add(lastCorrect.questionId)
      return next
    })
  }, [lastCorrect, myUserId])

  if (!question) return null

  const revealedAnswer = question.revealedAnswer?.trim()
  const youGotIt = answeredQuestionIds.has(question.id)
  const progress = `Question ${question.index + 1} of ${question.total}`

  return (
    <Box width="full" px={2} pt={2}>
      <Box borderWidth="1px" borderRadius="lg" bg="bg" shadow="sm" px={4} py={collapsed ? 2 : 3}>
        <HStack justify="space-between" align="center" gap={2}>
          <HStack gap={2} minW={0} flex={1}>
            <Box color="primary.solid" flexShrink={0}>
              <LuBrain />
            </Box>
            {collapsed ? (
              <Text fontSize="sm" truncate>
                Quiz · {progress}
              </Text>
            ) : (
              <Text fontSize="xs" color="fg.muted">
                {progress}
              </Text>
            )}
          </HStack>
          <IconButton
            aria-label={collapsed ? "Expand quiz question" : "Collapse quiz question"}
            size="xs"
            variant="ghost"
            onClick={() => setCollapsed((c) => !c)}
          >
            {collapsed ? <LuMaximize2 /> : <LuMinus />}
          </IconButton>
        </HStack>

        {!collapsed && (
          <VStack align="stretch" gap={2} mt={2}>
            <Text fontWeight="semibold" fontSize="md">
              {question.text}
            </Text>
            {revealedAnswer ? (
              <Badge colorPalette="green" alignSelf="flex-start">
                Answer: {revealedAnswer}
              </Badge>
            ) : youGotIt ? (
              <Badge colorPalette="green" alignSelf="flex-start">
                You got it! ✓
              </Badge>
            ) : (
              <Text fontSize="sm" color="fg.muted">
                {hint}
              </Text>
            )}
          </VStack>
        )}
      </Box>
    </Box>
  )
}
