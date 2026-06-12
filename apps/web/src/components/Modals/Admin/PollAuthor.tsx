import { useCallback, useEffect, useRef, useState } from "react"
import { LuPlus, LuTrash2 } from "react-icons/lu"
import { POLL_OPTION_LIMITS } from "@repo/types/Poll"
import {
  Button,
  Field,
  HStack,
  IconButton,
  Input,
  Switch,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import {
  EMPTY_POLL_DRAFT,
  clearPollDraft,
  getPollDraft,
  setPollDraft,
  type PollDraft,
} from "../../../lib/pollDraftPreference"
import { toaster } from "../../ui/toaster"

const SUBSCRIPTION_ID = "admin-poll-author"

type Props = {
  roomId: string | undefined
  hasActiveOpenPoll: boolean
}

function validateDraft(draft: PollDraft): string | null {
  const question = draft.question.trim()
  if (!question) return "Enter a poll question."
  if (question.length > 280) return "Question must be 280 characters or fewer."

  const labels = draft.options.map((o) => o.trim()).filter(Boolean)
  if (labels.length < POLL_OPTION_LIMITS.min) {
    return `Add at least ${POLL_OPTION_LIMITS.min} options with labels.`
  }
  if (labels.some((l) => l.length > 120)) {
    return "Each option must be 120 characters or fewer."
  }

  return null
}

export default function PollAuthor({ roomId, hasActiveOpenPoll }: Props) {
  const [draft, setDraft] = useState<PollDraft>(EMPTY_POLL_DRAFT)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const publishPendingRef = useRef(false)
  const roomIdRef = useRef(roomId)

  useEffect(() => {
    roomIdRef.current = roomId
  }, [roomId])

  useEffect(() => {
    if (!roomId) {
      setDraft(EMPTY_POLL_DRAFT)
      return
    }
    setDraft(getPollDraft(roomId) ?? EMPTY_POLL_DRAFT)
    setSubmitError(null)
  }, [roomId])

  useEffect(() => {
    if (!roomId) return
    setPollDraft(roomId, draft)
  }, [roomId, draft])

  useEffect(() => {
    subscribeById(SUBSCRIPTION_ID, {
      send: (event: { type: string; data?: unknown }) => {
        if (event.type === "POLL_PUBLISHED") {
          const d = event.data as { roomId?: string }
          if (d.roomId && d.roomId !== roomIdRef.current) return
          if (!publishPendingRef.current) return

          publishPendingRef.current = false
          setPublishing(false)
          setSubmitError(null)
          setDraft(EMPTY_POLL_DRAFT)
          if (roomIdRef.current) clearPollDraft(roomIdRef.current)

          toaster.create({
            title: "Poll published",
            type: "success",
            duration: 3000,
          })
          return
        }

        if (event.type === "ERROR_OCCURRED" && publishPendingRef.current) {
          publishPendingRef.current = false
          setPublishing(false)
          const err = event.data as { message?: string } | undefined
          setSubmitError(err?.message ?? "Could not publish poll.")
        }
      },
    })

    return () => {
      unsubscribeById(SUBSCRIPTION_ID)
    }
  }, [])

  const updateQuestion = useCallback((question: string) => {
    setDraft((prev) => ({ ...prev, question }))
    setSubmitError(null)
  }, [])

  const updateOption = useCallback((index: number, label: string) => {
    setDraft((prev) => {
      const options = [...prev.options]
      options[index] = label
      return { ...prev, options }
    })
    setSubmitError(null)
  }, [])

  const addOption = useCallback(() => {
    setDraft((prev) => ({ ...prev, options: [...prev.options, ""] }))
  }, [])

  const removeOption = useCallback((index: number) => {
    setDraft((prev) => {
      if (prev.options.length <= POLL_OPTION_LIMITS.min) return prev
      return { ...prev, options: prev.options.filter((_, i) => i !== index) }
    })
  }, [])

  const toggleHideRunningTotal = useCallback((checked: boolean) => {
    setDraft((prev) => ({ ...prev, hideRunningTotal: checked }))
  }, [])

  const publish = useCallback(() => {
    if (!roomId || hasActiveOpenPoll) return

    const validationError = validateDraft(draft)
    if (validationError) {
      setSubmitError(validationError)
      return
    }

    const labels = draft.options.map((o) => o.trim()).filter(Boolean)

    publishPendingRef.current = true
    setPublishing(true)
    setSubmitError(null)

    emitToSocket("CREATE_POLL", {
      question: draft.question.trim(),
      options: labels.map((label) => ({ label })),
      settings: { hideRunningTotal: draft.hideRunningTotal },
    })
  }, [roomId, hasActiveOpenPoll, draft])

  const activePollMessage =
    "Another poll is already active. Close it before publishing a new one."

  return (
    <VStack align="stretch" gap={4}>
      <Field.Root invalid={hasActiveOpenPoll}>
        <Field.Label>Poll question</Field.Label>
        <Textarea
          value={draft.question}
          onChange={(e) => updateQuestion(e.target.value)}
          placeholder="What should we vote on?"
          maxLength={280}
          rows={3}
          disabled={publishing || hasActiveOpenPoll}
        />
        <Field.HelperText>1–280 characters.</Field.HelperText>
        {hasActiveOpenPoll && <Field.ErrorText>{activePollMessage}</Field.ErrorText>}
      </Field.Root>

      <Field.Root>
        <Field.Label>Options</Field.Label>
        <VStack align="stretch" gap={2}>
          {draft.options.map((option, index) => (
            <HStack key={index} gap={2}>
              <Input
                value={option}
                onChange={(e) => updateOption(index, e.target.value)}
                placeholder={`Option ${index + 1}`}
                maxLength={120}
                disabled={publishing || hasActiveOpenPoll}
              />
              <IconButton
                aria-label={`Remove option ${index + 1}`}
                variant="ghost"
                colorPalette="red"
                onClick={() => removeOption(index)}
                disabled={
                  publishing || hasActiveOpenPoll || draft.options.length <= POLL_OPTION_LIMITS.min
                }
              >
                <LuTrash2 />
              </IconButton>
            </HStack>
          ))}
        </VStack>
        <Field.HelperText>At least {POLL_OPTION_LIMITS.min} options. No maximum.</Field.HelperText>
      </Field.Root>

      <Button
        variant="outline"
        alignSelf="flex-start"
        onClick={addOption}
        disabled={publishing || hasActiveOpenPoll}
      >
        <LuPlus />
        Add option
      </Button>

      <Field.Root>
        <HStack justify="space-between" align="center">
          <Field.Label mb={0}>Hide running vote total</Field.Label>
          <Switch.Root
            checked={draft.hideRunningTotal}
            onCheckedChange={(details) => toggleHideRunningTotal(!!details.checked)}
            disabled={publishing || hasActiveOpenPoll}
          >
            <Switch.HiddenInput />
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
          </Switch.Root>
        </HStack>
        <Field.HelperText>
          When enabled, listeners do not see how many votes have been cast until the poll closes.
        </Field.HelperText>
      </Field.Root>

      <Field.Root invalid={!!submitError && !hasActiveOpenPoll}>
        <Button
          colorPalette="action"
          loading={publishing}
          disabled={!roomId || hasActiveOpenPoll}
          onClick={publish}
          alignSelf="flex-start"
        >
          Publish
        </Button>
        {submitError && !hasActiveOpenPoll && <Field.ErrorText>{submitError}</Field.ErrorText>}
      </Field.Root>
    </VStack>
  )
}
