"use client"

import { useCallback, useMemo, useState } from "react"
import { POLL_OPTION_LIMITS } from "@repo/types"
import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  HStack,
  IconButton,
  Input,
  Separator,
  Stack,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { Plus, Trash2 } from "lucide-react"
import type { StudioRoom } from "../../studio/studioRoom"
import { closeStudioPoll, createStudioPoll } from "../../studio/studioActions"
import { toaster } from "../ui/toaster"

const EMPTY_OPTIONS = ["", ""]

type PollPanelProps = {
  room: StudioRoom
}

function tallyVotes(room: StudioRoom): Record<string, number> {
  const tallies: Record<string, number> = {}
  for (const optionId of room.pollVotes.values()) {
    tallies[optionId] = (tallies[optionId] ?? 0) + 1
  }
  return tallies
}

export function PollPanel({ room }: PollPanelProps) {
  const [question, setQuestion] = useState("")
  const [options, setOptions] = useState<string[]>(EMPTY_OPTIONS)
  const [hideRunningTotal, setHideRunningTotal] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [closing, setClosing] = useState(false)

  const activePoll = room.activePoll
  const hasActiveOpenPoll = activePoll?.status === "open"

  const voteTallies = useMemo(() => {
    void room.snapshotEpoch
    return hasActiveOpenPoll ? tallyVotes(room) : {}
  }, [room, hasActiveOpenPoll])

  const voteBreakdown = useMemo(() => {
    void room.snapshotEpoch
    if (!hasActiveOpenPoll || !activePoll) return []

    const entries: { userId: string; username: string; optionLabel: string }[] = []
    for (const [userId, optionId] of room.pollVotes) {
      const user = room.users.get(userId)
      const optionLabel =
        activePoll.options.find((o) => o.id === optionId)?.label ?? optionId
      entries.push({
        userId,
        username: user?.username ?? userId,
        optionLabel,
      })
    }
    return entries.sort((a, b) => a.username.localeCompare(b.username))
  }, [room, hasActiveOpenPoll, activePoll])

  const history = useMemo(() => {
    void room.snapshotEpoch
    return room.pollHistory
  }, [room])

  const resetForm = useCallback(() => {
    setQuestion("")
    setOptions(EMPTY_OPTIONS)
    setHideRunningTotal(false)
    setSubmitError(null)
  }, [])

  const publish = useCallback(() => {
    setPublishing(true)
    setSubmitError(null)

    const result = createStudioPoll({
      question,
      options: options.map((label) => ({ label })),
      hideRunningTotal,
    })

    setPublishing(false)

    if (!result.ok) {
      setSubmitError(result.message)
      return
    }

    resetForm()
    toaster.create({
      title: "Poll published",
      description: result.poll.question,
      type: "success",
      duration: 3000,
    })
  }, [question, options, hideRunningTotal, resetForm])

  const closePoll = useCallback(() => {
    setClosing(true)
    const result = closeStudioPoll()
    setClosing(false)

    if (!result.ok) {
      toaster.create({
        title: "Could not close poll",
        description: result.message,
        type: "error",
        duration: 5000,
      })
      return
    }

    toaster.create({
      title: "Poll closed",
      type: "success",
      duration: 3000,
    })
  }, [])

  return (
    <Stack gap="4">
      {hasActiveOpenPoll && activePoll ? (
        <Box borderWidth="1px" borderRadius="md" p="3" bg="bg.subtle">
          <VStack align="stretch" gap="3">
            <HStack justify="space-between" align="flex-start" gap="3" flexWrap="wrap">
              <VStack align="start" gap="1" flex="1" minW={0}>
                <HStack gap="2" flexWrap="wrap">
                  <Text fontWeight="semibold">{activePoll.question}</Text>
                  <Badge size="sm" colorPalette="green" variant="solid">
                    Open
                  </Badge>
                </HStack>
                {activePoll.settings.hideRunningTotal && (
                  <Text fontSize="xs" color="fg.muted">
                    Running total hidden from preview listeners
                  </Text>
                )}
              </VStack>
              <Button
                size="sm"
                colorPalette="red"
                loading={closing}
                onClick={closePoll}
                flexShrink={0}
              >
                Close poll
              </Button>
            </HStack>

            <Stack gap="2">
              {activePoll.options.map((option) => (
                <HStack key={option.id} justify="space-between" fontSize="sm">
                  <Text>{option.label}</Text>
                  <Text color="fg.muted" fontFamily="mono">
                    {voteTallies[option.id] ?? 0} vote
                    {(voteTallies[option.id] ?? 0) === 1 ? "" : "s"}
                  </Text>
                </HStack>
              ))}
            </Stack>

            <Box>
              <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mb="2">
                Votes by user
              </Text>
              {voteBreakdown.length === 0 ? (
                <Text fontSize="sm" color="fg.muted">
                  No votes yet — cast from the Listening Room preview.
                </Text>
              ) : (
                <Stack gap="1" fontSize="sm">
                  {voteBreakdown.map((row) => (
                    <Text key={row.userId}>
                      {row.username} → {row.optionLabel}
                    </Text>
                  ))}
                </Stack>
              )}
            </Box>
          </VStack>
        </Box>
      ) : (
        <VStack align="stretch" gap="3">
          <Text fontSize="sm" color="fg.muted">
            No poll is open. Publish one to preview PollCard in the Listening Room.
          </Text>

          <Field.Root>
            <Field.Label fontSize="sm">Question</Field.Label>
            <Textarea
              size="sm"
              value={question}
              onChange={(e) => {
                setQuestion(e.target.value)
                setSubmitError(null)
              }}
              placeholder="What should listeners vote on?"
              rows={2}
              maxLength={280}
            />
          </Field.Root>

          <Field.Root>
            <Field.Label fontSize="sm">Options</Field.Label>
            <Stack gap="2">
              {options.map((option, index) => (
                <HStack key={index} gap="2">
                  <Input
                    size="sm"
                    value={option}
                    onChange={(e) => {
                      const next = [...options]
                      next[index] = e.target.value
                      setOptions(next)
                      setSubmitError(null)
                    }}
                    placeholder={`Option ${index + 1}`}
                    maxLength={120}
                  />
                  <IconButton
                    size="sm"
                    aria-label={`Remove option ${index + 1}`}
                    variant="ghost"
                    colorPalette="red"
                    onClick={() => {
                      if (options.length <= POLL_OPTION_LIMITS.min) return
                      setOptions(options.filter((_, i) => i !== index))
                    }}
                    disabled={options.length <= POLL_OPTION_LIMITS.min}
                  >
                    <Trash2 size={16} />
                  </IconButton>
                </HStack>
              ))}
            </Stack>
          </Field.Root>

          <Button
            size="sm"
            variant="outline"
            alignSelf="flex-start"
            onClick={() => setOptions([...options, ""])}
          >
            <Plus size={16} /> Add option
          </Button>

          <Checkbox.Root
            checked={hideRunningTotal}
            onCheckedChange={(details) => setHideRunningTotal(details.checked === true)}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label fontSize="sm">Hide running vote total in preview</Checkbox.Label>
          </Checkbox.Root>

          <Field.Root invalid={!!submitError}>
            <Button
              size="sm"
              colorPalette="blue"
              loading={publishing}
              onClick={publish}
              alignSelf="flex-start"
            >
              Publish
            </Button>
            {submitError && <Field.ErrorText>{submitError}</Field.ErrorText>}
          </Field.Root>
        </VStack>
      )}

      {history.length > 0 && (
        <>
          <Separator />
          <Box>
            <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mb="2">
              History
            </Text>
            <Stack gap="2">
              {history.map((entry) => {
                const winnerLabels = entry.results.winners
                  .map((id) => entry.poll.options.find((o) => o.id === id)?.label ?? id)
                  .join(", ")
                return (
                  <Box key={entry.poll.id} borderWidth="1px" borderRadius="sm" p="2">
                    <Text fontSize="sm" fontWeight="medium">
                      {entry.poll.question}
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      {entry.results.totalVotes} vote
                      {entry.results.totalVotes === 1 ? "" : "s"}
                      {winnerLabels ? ` · Winner${entry.results.winners.length > 1 ? "s" : ""}: ${winnerLabels}` : ""}
                    </Text>
                  </Box>
                )
              })}
            </Stack>
          </Box>
        </>
      )}
    </Stack>
  )
}
