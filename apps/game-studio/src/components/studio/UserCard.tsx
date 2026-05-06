"use client"

import {
  Badge,
  Box,
  Button,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Separator,
  Stack,
  Text,
  Wrap,
} from "@chakra-ui/react"
import type { ItemDefinition } from "@repo/types"
import { getActiveFlags } from "@repo/types"
import { User as UserIcon } from "lucide-react"
import { useMemo, useState } from "react"
import * as studioActions from "../../studio/studioActions"
import type { StudioRoom } from "../../studio/studioRoom"
import { toaster } from "../ui/toaster"

function toastResult(title: string, ok: boolean, detail?: string): void {
  toaster.create({
    title,
    description: detail,
    type: ok ? "success" : "error",
  })
}

export type UserCardProps = {
  room: StudioRoom
  userId: string
  now: number
}

export function UserCard({ room, userId, now }: UserCardProps) {
  const user = room.users.get(userId)
  const state = room.getUserState(userId)
  const inventory = room.getInventory(userId)

  const longModifierThresholdMs = 365 * 24 * 60 * 60 * 1000

  const defaultOtherUser = useMemo(() => {
    const other = [...room.users.keys()].find((id) => id !== userId)
    return other ?? userId
  }, [room.snapshotEpoch, userId])

  const defaultQueueTrackId = useMemo(() => {
    const q = room.queue
    return q[1]?.track.id ?? q[0]?.track.id ?? ""
  }, [room.snapshotEpoch])

  const [pickUserId, setPickUserId] = useState<string | null>(null)
  const [pickQueueTrackId, setPickQueueTrackId] = useState<string | null>(null)
  const [chatDraft, setChatDraft] = useState("")
  const [emojiDraft, setEmojiDraft] = useState("👍")

  const effectiveTargetUser = pickUserId ?? defaultOtherUser
  const effectiveQueueTrack = pickQueueTrackId ?? defaultQueueTrackId

  if (!user) return null

  const coin = state?.attributes?.coin ?? 0
  const score = state?.attributes?.score ?? 0
  const modifiers = state?.modifiers ?? []
  const flags = getActiveFlags(modifiers, now)

  const run = async (title: string, fn: () => Promise<string | void>) => {
    try {
      const msg = await fn()
      const ok = !msg?.toLowerCase().includes("fail") && !msg?.toLowerCase().includes("blocked")
      toastResult(title, ok, msg ?? undefined)
    } catch (e) {
      toastResult(title, false, String(e))
    }
  }

  function buildUseContext(def: ItemDefinition | null): unknown {
    const rt = def?.requiresTarget
    if (rt === "user" || rt === "self") {
      return { targetUserId: effectiveTargetUser }
    }
    if (rt === "queueItem") {
      return { targetQueueItemId: effectiveQueueTrack }
    }
    return undefined
  }

  return (
    <Box borderWidth="1px" borderRadius="md" p="4" minH="xs">
      <Stack gap="3">
        <HStack justify="space-between" align="flex-start">
          <HStack gap="2">
            <UserIcon size={18} />
            <Heading size="md">{user.username}</Heading>
          </HStack>
          <Badge colorPalette={state ? "green" : "gray"}>{state ? "In session" : "Idle"}</Badge>
        </HStack>

        <HStack gap="4" fontSize="sm">
          <Text>
            <strong>Coins:</strong> {coin}
          </Text>
          <Text>
            <strong>Score:</strong> {score}
          </Text>
        </HStack>

        <Box>
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mb="1">
            Modifiers
          </Text>
          <Wrap gap="1">
            {modifiers.length === 0 ? (
              <Text fontSize="xs" color="fg.muted">
                None
              </Text>
            ) : (
              modifiers.map((m) => {
                const ttlSec = Math.max(0, Math.ceil((m.endAt - now) / 1000))
                const ttlLabel =
                  m.endAt > now + longModifierThresholdMs ? "∞" : `${ttlSec}s`
                return (
                  <Badge key={m.id} variant="subtle" colorPalette="purple">
                    {m.name}
                    {m.endAt > now ? ` · ${ttlLabel}` : ""}
                  </Badge>
                )
              })
            )}
          </Wrap>
        </Box>

        <Box>
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted" mb="1">
            Flags
          </Text>
          <Wrap gap="1">
            {Object.entries(flags).filter(([, v]) => v).length === 0 ? (
              <Text fontSize="xs" color="fg.muted">
                None
              </Text>
            ) : (
              Object.entries(flags)
                .filter(([, v]) => v)
                .map(([k]) => (
                  <Badge key={k} variant="outline" colorPalette="orange">
                    {k}
                  </Badge>
                ))
            )}
          </Wrap>
        </Box>

        <Separator />

        <Stack gap="2">
          <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
            Targeting (items)
          </Text>
          <Field.Root gap="1">
            <Field.Label fontSize="xs">Target user</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={effectiveTargetUser}
                onChange={(e) => setPickUserId(e.target.value)}
              >
                {[...room.users.keys()].map((id) => (
                  <option key={id} value={id}>
                    {room.users.get(id)?.username ?? id}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>

          <Field.Root gap="1">
            <Field.Label fontSize="xs">Queue track</Field.Label>
            {room.queue.length === 0 ? (
              <Text fontSize="xs" color="fg.muted">
                Queue empty — add a track first.
              </Text>
            ) : (
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value={effectiveQueueTrack}
                  onChange={(e) => setPickQueueTrackId(e.target.value)}
                >
                  {room.queue.map((q) => (
                    <option key={q.track.id} value={q.track.id}>
                      {q.title} ({q.track.id.slice(0, 8)}…)
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            )}
          </Field.Root>
        </Stack>

        <Separator />

        <Wrap gap="2">
          <Button
            size="xs"
            variant="surface"
            onClick={() =>
              void run("Queue", async () => {
                await studioActions.addFakeTrackToQueue(userId)
                return "Track queued"
              })
            }
          >
            + Track
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              void run("Skip", async () => {
                await studioActions.advanceNowPlaying()
                return "Advanced now playing"
              })
            }
          >
            Advance NP
          </Button>
          <Button
            size="xs"
            onClick={() =>
              void run("Coins", async () => {
                await studioActions.applyGainCoin(userId, 10)
                return "+10 coins"
              })
            }
          >
            +10 coins
          </Button>
          <Button
            size="xs"
            onClick={() =>
              void run("Score", async () => {
                await studioActions.applyGainScore(userId, 10)
                return "+10 score"
              })
            }
          >
            +10 score
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              void run("Reaction", async () => {
                await studioActions.reactToNowPlaying(userId, emojiDraft.trim() || "👍")
                return "Reaction sent"
              })
            }
          >
            React
          </Button>
          <Input
            size="xs"
            width="16"
            placeholder="emoji"
            value={emojiDraft}
            onChange={(e) => setEmojiDraft(e.target.value)}
          />
        </Wrap>

        <HStack gap="2" align="flex-end">
          <Input
            flex="1"
            size="sm"
            placeholder="Chat message…"
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
          />
          <Button
            size="sm"
            onClick={() =>
              void run("Chat", async () => {
                await studioActions.sendChatAsUser(userId, chatDraft.trim() || "hello")
                setChatDraft("")
                return "Sent"
              })
            }
          >
            Send
          </Button>
        </HStack>

        <Separator />

        <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
          Inventory
        </Text>
        <Stack gap="2" fontSize="sm">
          {inventory.length === 0 ? (
            <Text fontSize="xs" color="fg.muted">
              Empty
            </Text>
          ) : (
            inventory.map((row) => {
              const def = room.getDefinition(row.definitionId)
              const label = def?.name ?? row.definitionId
              const rt = def?.requiresTarget
              const queueBlocked = rt === "queueItem" && !effectiveQueueTrack

              return (
                <HStack key={row.itemId} justify="space-between" align="flex-start" wrap="wrap">
                  <Box>
                    <Text fontWeight="medium">
                      {label}
                      {row.quantity > 1 ? ` ×${row.quantity}` : ""}
                    </Text>
                    {rt ? (
                      <Text fontSize="xs" color="fg.muted">
                        Requires: {rt}
                      </Text>
                    ) : null}
                  </Box>
                  <HStack gap="1">
                    <Button
                      size="xs"
                      variant="surface"
                      disabled={queueBlocked}
                      onClick={() =>
                        void run(`Use ${label}`, async () =>
                          studioActions.useInventoryItem(userId, row.itemId, buildUseContext(def)),
                        )
                      }
                    >
                      Use
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() =>
                        void run(`Sell ${label}`, async () =>
                          studioActions.sellInventoryItem(userId, row.itemId),
                        )
                      }
                    >
                      Sell
                    </Button>
                  </HStack>
                </HStack>
              )
            })
          )}
        </Stack>
      </Stack>
    </Box>
  )
}
