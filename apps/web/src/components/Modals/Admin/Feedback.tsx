import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Badge,
  Box,
  Button,
  DialogBody,
  DialogFooter,
  HStack,
  IconButton,
  Input,
  Separator,
  Text,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { LuArrowDown, LuArrowUp, LuPlus, LuTrash2 } from "react-icons/lu"
import { FEEDBACK_LIMITS, GENERAL_FEEDBACK_TOPIC_ID } from "@repo/types"
import type { FeedbackTopic } from "@repo/types"
import {
  useFeedbackInbox,
  useFeedbackInboxTopics,
  useFeedbackSend,
  useFeedbackTopics,
  useTabNotificationIds,
} from "../../../hooks/useActors"

type DraftTopic = {
  /** Existing server id when editing; undefined for new rows. */
  id?: string
  clientKey: string
  title: string
  description: string
}

function toDrafts(topics: FeedbackTopic[]): DraftTopic[] {
  return topics.map((t) => ({
    id: t.id,
    clientKey: t.id,
    title: t.title,
    description: t.description ?? "",
  }))
}

export default function Feedback() {
  const feedbackSend = useFeedbackSend()
  const topics = useFeedbackTopics()
  const inbox = useFeedbackInbox()
  const inboxTopics = useFeedbackInboxTopics()
  const adminTabNotifs = useTabNotificationIds("adminSettings")
  const [drafts, setDrafts] = useState<DraftTopic[]>(() => toDrafts(topics))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    feedbackSend({ type: "FETCH_INBOX" })
  }, [feedbackSend])

  useEffect(() => {
    setDrafts(toDrafts(topics))
  }, [topics])

  const topicTitleById = useMemo(() => {
    const map = new Map<string, string>()
    for (const t of inboxTopics) map.set(t.id, t.title)
    for (const t of topics) map.set(t.id, t.title)
    map.set(GENERAL_FEEDBACK_TOPIC_ID, "General feedback")
    return map
  }, [inboxTopics, topics])

  const groupedInbox = useMemo(() => {
    const groups: { topicId: string; title: string; entries: typeof inbox }[] = []
    const byTopic = new Map<string, typeof inbox>()
    for (const entry of inbox) {
      const list = byTopic.get(entry.topicId) ?? []
      list.push(entry)
      byTopic.set(entry.topicId, list)
    }
    const orderedIds = [
      ...topics.map((t) => t.id),
      ...inboxTopics.filter((t) => t.status === "archived").map((t) => t.id),
      GENERAL_FEEDBACK_TOPIC_ID,
    ]
    const seen = new Set<string>()
    for (const topicId of orderedIds) {
      if (seen.has(topicId)) continue
      seen.add(topicId)
      const entries = byTopic.get(topicId)
      if (!entries?.length) continue
      groups.push({
        topicId,
        title: topicTitleById.get(topicId) ?? topicId,
        entries,
      })
    }
    for (const [topicId, entries] of byTopic) {
      if (seen.has(topicId)) continue
      groups.push({
        topicId,
        title: topicTitleById.get(topicId) ?? topicId,
        entries,
      })
    }
    return groups
  }, [inbox, inboxTopics, topicTitleById, topics])

  const addTopic = useCallback(() => {
    if (drafts.length >= FEEDBACK_LIMITS.maxActiveTopics) return
    setDrafts((prev) => [
      ...prev,
      {
        clientKey: `new-${Date.now()}`,
        title: "",
        description: "",
      },
    ])
  }, [drafts.length])

  const saveTopics = useCallback(() => {
    const payload = drafts
      .map((d) => ({
        id: d.id,
        title: d.title.trim(),
        description: d.description.trim() || undefined,
      }))
      .filter((d) => d.title.length > 0)
    setSaving(true)
    feedbackSend({ type: "SET_TOPICS", data: { topics: payload } })
    window.setTimeout(() => setSaving(false), 800)
  }, [drafts, feedbackSend])

  return (
    <>
      <DialogBody>
        <VStack align="stretch" gap={6}>
          <VStack align="stretch" gap={3}>
            <HStack justify="space-between">
              <Text fontWeight="semibold">Topics</Text>
              {adminTabNotifs.has("feedback") ? (
                <Badge colorPalette="primary" size="sm">
                  New responses
                </Badge>
              ) : null}
            </HStack>
            <Text fontSize="sm" color="fg.muted">
              Listeners see these in Preferences → Feedback. Removing a topic archives it
              (responses are kept for export).
            </Text>
            {drafts.map((draft, index) => (
              <Box
                key={draft.clientKey}
                borderWidth="1px"
                borderColor="border.muted"
                borderRadius="md"
                p={3}
              >
                <VStack align="stretch" gap={2}>
                  <HStack>
                    <Input
                      placeholder="Topic title"
                      value={draft.title}
                      onChange={(e) => {
                        const title = e.target.value
                        setDrafts((prev) =>
                          prev.map((d) =>
                            d.clientKey === draft.clientKey ? { ...d, title } : d,
                          ),
                        )
                      }}
                    />
                    <IconButton
                      aria-label="Move up"
                      size="sm"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => {
                        setDrafts((prev) => {
                          const next = [...prev]
                          const tmp = next[index - 1]!
                          next[index - 1] = next[index]!
                          next[index] = tmp
                          return next
                        })
                      }}
                    >
                      <LuArrowUp />
                    </IconButton>
                    <IconButton
                      aria-label="Move down"
                      size="sm"
                      variant="ghost"
                      disabled={index === drafts.length - 1}
                      onClick={() => {
                        setDrafts((prev) => {
                          const next = [...prev]
                          const tmp = next[index + 1]!
                          next[index + 1] = next[index]!
                          next[index] = tmp
                          return next
                        })
                      }}
                    >
                      <LuArrowDown />
                    </IconButton>
                    <IconButton
                      aria-label="Remove topic"
                      size="sm"
                      variant="ghost"
                      colorPalette="red"
                      onClick={() => {
                        setDrafts((prev) =>
                          prev.filter((d) => d.clientKey !== draft.clientKey),
                        )
                      }}
                    >
                      <LuTrash2 />
                    </IconButton>
                  </HStack>
                  <Textarea
                    placeholder="Optional description"
                    rows={2}
                    value={draft.description}
                    onChange={(e) => {
                      const description = e.target.value
                      setDrafts((prev) =>
                        prev.map((d) =>
                          d.clientKey === draft.clientKey ? { ...d, description } : d,
                        ),
                      )
                    }}
                  />
                </VStack>
              </Box>
            ))}
            <HStack>
              <Button
                size="sm"
                variant="outline"
                onClick={addTopic}
                disabled={drafts.length >= FEEDBACK_LIMITS.maxActiveTopics}
              >
                <LuPlus />
                Add topic
              </Button>
              <Button size="sm" colorPalette="primary" loading={saving} onClick={saveTopics}>
                Save topics
              </Button>
            </HStack>
          </VStack>

          <Separator />

          <VStack align="stretch" gap={3}>
            <Text fontWeight="semibold">Inbox</Text>
            {groupedInbox.length === 0 ? (
              <Text fontSize="sm" color="fg.muted">
                No responses yet.
              </Text>
            ) : (
              groupedInbox.map((group) => (
                <Box key={group.topicId}>
                  <Text fontWeight="medium" mb={2}>
                    {group.title}
                  </Text>
                  <VStack align="stretch" gap={2}>
                    {group.entries.map((entry) => (
                      <Box
                        key={`${entry.topicId}-${entry.userId}`}
                        borderWidth="1px"
                        borderColor="border.muted"
                        borderRadius="md"
                        p={3}
                        bg="bg.subtle"
                      >
                        <HStack justify="space-between" gap={2} mb={1}>
                          <Text fontWeight="semibold" fontSize="sm">
                            {entry.username}
                          </Text>
                          <Badge
                            size="sm"
                            colorPalette={
                              entry.vote === "up"
                                ? "green"
                                : entry.vote === "down"
                                  ? "red"
                                  : "gray"
                            }
                          >
                            {entry.vote === "up"
                              ? "👍"
                              : entry.vote === "down"
                                ? "👎"
                                : "Comment"}
                          </Badge>
                        </HStack>
                        {entry.comment.trim() ? (
                          <Text fontSize="sm" whiteSpace="pre-wrap">
                            {entry.comment}
                          </Text>
                        ) : (
                          <Text fontSize="sm" color="fg.muted">
                            No comment
                          </Text>
                        )}
                        <Text fontSize="xs" color="fg.muted" mt={1}>
                          {new Date(entry.updatedAt).toLocaleString()}
                        </Text>
                      </Box>
                    ))}
                  </VStack>
                </Box>
              ))
            )}
          </VStack>
        </VStack>
      </DialogBody>
      <DialogFooter />
    </>
  )
}
