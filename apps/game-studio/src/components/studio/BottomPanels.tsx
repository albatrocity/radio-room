"use client"

import { Box, Code, Field, Heading, Input, Stack, Text } from "@chakra-ui/react"
import type { StudioRoom } from "../../studio/studioRoom"
import { formatChatBody } from "../../lib/formatChatMessage"
import { type ReactNode, useMemo, useState } from "react"

export type BottomPanelsProps = {
  room: StudioRoom
}

export function BottomPanels({ room }: BottomPanelsProps) {
  const [eventFilter, setEventFilter] = useState("")

  const filteredEvents = useMemo(() => {
    const q = eventFilter.trim().toLowerCase()
    const base = room.events.slice(-400)
    if (!q) return base.slice().reverse()
    return base
      .filter((e) => e.kind.toLowerCase().includes(q) || JSON.stringify(e.payload).toLowerCase().includes(q))
      .slice()
      .reverse()
  }, [room.snapshotEpoch, room.events, eventFilter])

  const recentChat = useMemo(() => room.chat.slice(-200).reverse(), [room.snapshotEpoch, room.chat])

  return (
    <Stack gap="4">
      <Stack direction={{ base: "column", lg: "row" }} gap="4" align="stretch">
        <PanelShell title="Queue">
          {room.queue.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              Empty — use “+ Track” on a user card.
            </Text>
          ) : (
            <Stack gap="2">
              {room.queue.map((q, index) => (
                <Box key={`${q.track.id}-${index}`} borderWidth="1px" borderRadius="sm" p="2">
                  <Text fontWeight="medium">{index === 0 ? "▶ " : `${index + 1}. `}{q.title}</Text>
                  <Text fontSize="xs" color="fg.muted">
                    id {q.track.id}{" "}
                    {q.addedBy?.username ? ` · by ${q.addedBy.username}` : ""}
                  </Text>
                </Box>
              ))}
            </Stack>
          )}
        </PanelShell>

        <PanelShell title="Event log">
          <Field.Root mb="3">
            <Field.Label fontSize="xs">Filter</Field.Label>
            <Input
              size="sm"
              placeholder="kind or payload substring…"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
            />
          </Field.Root>
          <Stack gap="1" fontFamily="mono" fontSize="xs">
            {filteredEvents.map((e, idx) => (
              <Box key={`${e.at}-${e.kind}-${idx}`} borderBottomWidth="1px" pb="1">
                <Text color="fg.muted">
                  {new Date(e.at).toLocaleTimeString()} · {e.kind}
                </Text>
                <Code display="block" whiteSpace="pre-wrap" variant="subtle" fontSize="10px">
                  {JSON.stringify(e.payload)}
                </Code>
              </Box>
            ))}
          </Stack>
        </PanelShell>
      </Stack>

      <PanelShell title="Chat">
        <Stack gap="2">
          {recentChat.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              No messages yet.
            </Text>
          ) : (
            recentChat.map((m, i) => (
              <Box key={`${m.timestamp}-${i}`} borderWidth="1px" borderRadius="sm" p="2">
                <Text fontSize="xs" color="fg.muted">
                  {m.user.username} · {new Date(m.timestamp).toLocaleTimeString()}
                </Text>
                <Text fontSize="sm">{formatChatBody(m)}</Text>
              </Box>
            ))
          )}
        </Stack>
      </PanelShell>
    </Stack>
  )
}

function PanelShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Box flex="1" minW="0" borderWidth="1px" borderRadius="md" p="3" maxH="sm" overflowY="auto">
      <Heading size="sm" mb="3">
        {title}
      </Heading>
      {children}
    </Box>
  )
}
