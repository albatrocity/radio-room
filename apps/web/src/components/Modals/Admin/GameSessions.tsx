import { useEffect, useRef, useState, useCallback } from "react"
import type { GameSession } from "@repo/types"
import {
  Badge,
  Box,
  Button,
  DialogBody,
  DialogFooter,
  Field,
  HStack,
  Input,
  Separator,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import { format } from "date-fns"
import { useModalsSend, useCurrentRoom, useModalsSnapshot } from "../../../hooks/useActors"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { toaster } from "../../ui/toaster"

const SUBSCRIPTION_ID = "admin-settings-game-sessions"

export default function GameSessions() {
  const room = useCurrentRoom()
  const modalSend = useModalsSend()
  const modalsState = useModalsSnapshot()
  const panelOpen = modalsState.matches("settings.game_sessions")

  const [sessionName, setSessionName] = useState("")
  const [activeSession, setActiveSession] = useState<GameSession | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  /** True after we have received GAME_SESSION_STATUS at least once for this mount. */
  const seenStatusRef = useRef(false)
  /** True while a start/end request is in flight (for error toast routing). */
  const actionPendingRef = useRef(false)
  const roomIdRef = useRef(room?.id)

  const refreshStatus = useCallback(() => {
    emitToSocket("GET_GAME_SESSION_STATUS", {})
  }, [])

  useEffect(() => {
    roomIdRef.current = room?.id
  }, [room?.id])

  /** Whenever this settings panel is shown, reset and fetch current session from the server. */
  useEffect(() => {
    if (!panelOpen) return
    seenStatusRef.current = false
    setStatusLoading(true)
    setLoadError(null)
    refreshStatus()
  }, [panelOpen, refreshStatus])

  useEffect(() => {
    subscribeById(SUBSCRIPTION_ID, {
      send: (event: { type: string; data?: unknown }) => {
        if (event.type === "GAME_SESSION_STATUS") {
          seenStatusRef.current = true
          setStatusLoading(false)
          setLoadError(null)
          const d = event.data as { session: GameSession | null }
          setActiveSession(d.session ?? null)
          return
        }

        if (event.type === "GAME_SESSION_ADMIN_STARTED") {
          actionPendingRef.current = false
          setActionLoading(false)
          const d = event.data as { session: GameSession | null }
          if (d.session) setActiveSession(d.session)
          toaster.create({
            title: "Game session started",
            description: d.session?.config.name,
            type: "success",
            duration: 3000,
          })
          return
        }

        if (event.type === "GAME_SESSION_ADMIN_ENDED") {
          actionPendingRef.current = false
          setActionLoading(false)
          const d = event.data as { results: unknown | null }
          setActiveSession(null)
          if (d.results == null) {
            toaster.create({
              title: "No active session",
              description: "There was no game session to end.",
              type: "info",
              duration: 3000,
            })
          } else {
            toaster.create({
              title: "Game session ended",
              type: "success",
              duration: 3000,
            })
          }
          return
        }

        if (event.type === "GAME_SESSION_STARTED") {
          const d = event.data as { roomId: string }
          if (roomIdRef.current && d.roomId === roomIdRef.current) {
            refreshStatus()
          }
          return
        }

        if (event.type === "GAME_SESSION_ENDED") {
          const d = event.data as { roomId: string }
          if (roomIdRef.current && d.roomId === roomIdRef.current) {
            setActiveSession(null)
          }
          return
        }

        if (event.type === "ERROR_OCCURRED") {
          const err = event.data as { message?: string } | undefined
          setActionLoading(false)

          if (actionPendingRef.current) {
            actionPendingRef.current = false
            toaster.create({
              title: "Request failed",
              description: err?.message ?? "Something went wrong.",
              type: "error",
              duration: 5000,
            })
            return
          }

          if (!seenStatusRef.current) {
            setStatusLoading(false)
            setLoadError(err?.message ?? "Could not load game session status.")
          }
        }
      },
    })

    return () => {
      unsubscribeById(SUBSCRIPTION_ID)
    }
  }, [refreshStatus])

  const startSession = () => {
    const name = sessionName.trim()
    if (!name) {
      toaster.create({
        title: "Session name required",
        description: "Enter a name before starting a session.",
        type: "warning",
        duration: 3000,
      })
      return
    }
    actionPendingRef.current = true
    setActionLoading(true)
    emitToSocket("START_GAME_SESSION", { name })
  }

  const endSession = () => {
    actionPendingRef.current = true
    setActionLoading(true)
    emitToSocket("END_GAME_SESSION", {})
  }

  const startedLabel =
    activeSession != null
      ? format(new Date(activeSession.startedAt), "MMM d, yyyy · h:mm a")
      : ""

  return (
    <>
      <DialogBody>
        <VStack align="stretch" gap={4}>
          {statusLoading && !activeSession && (
            <HStack>
              <Spinner size="sm" />
              <Text fontSize="sm" color="gray.500">
                Loading session status…
              </Text>
            </HStack>
          )}

          {statusLoading && activeSession && (
            <HStack>
              <Spinner size="sm" />
              <Text fontSize="sm" color="fg.muted">
                Refreshing…
              </Text>
            </HStack>
          )}

          {loadError && !statusLoading && (
            <Text fontSize="sm" color="red.500">
              {loadError}
            </Text>
          )}

          {activeSession && (
            <Box borderWidth="1px" borderColor="border.muted" borderRadius="lg" p={4} bg="bg.subtle">
              <VStack align="stretch" gap={3}>
                <HStack justify="space-between" align="flex-start" gap={3} flexWrap="wrap">
                  <VStack align="start" gap={1} flex="1" minW={0}>
                    <HStack gap={2} flexWrap="wrap">
                      <Text fontWeight="semibold" fontSize="md">
                        {activeSession.config.name}
                      </Text>
                      <Badge size="sm" colorPalette="green" variant="solid">
                        Running
                      </Badge>
                    </HStack>
                    <Text fontSize="sm" color="fg.muted">
                      Started {startedLabel}
                    </Text>
                    {activeSession.config.description && (
                      <Text fontSize="sm" color="fg.muted">
                        {activeSession.config.description}
                      </Text>
                    )}
                    {activeSession.config.segmentId && (
                      <Text fontSize="xs" color="fg.subtle">
                        Linked segment · {activeSession.config.segmentId}
                      </Text>
                    )}
                    <Text fontSize="xs" color="fg.subtle">
                      Session ID · {activeSession.id}
                    </Text>
                  </VStack>
                  <Button
                    colorPalette="red"
                    variant="solid"
                    loading={actionLoading}
                    onClick={endSession}
                    flexShrink={0}
                  >
                    End session
                  </Button>
                </HStack>
              </VStack>
            </Box>
          )}

          {!activeSession && !statusLoading && !loadError && (
            <Text fontSize="sm" color="gray.600">
              No game session is running. Start one below to enable scoring, leaderboards, and
              plugin games for this room.
            </Text>
          )}

          <Separator />

          <Field.Root>
            <Field.Label>Start a new session</Field.Label>
            <Input
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder="e.g. Lunch trivia"
              disabled={actionLoading || statusLoading}
            />
            <Field.HelperText>
              Uses default attributes (score, coin) and leaderboards. If a session is already
              running, it will be ended first.
            </Field.HelperText>
          </Field.Root>

          <Button
            colorPalette="action"
            loading={actionLoading}
            disabled={statusLoading}
            onClick={startSession}
            alignSelf="flex-start"
          >
            Start session
          </Button>
        </VStack>
      </DialogBody>
      <DialogFooter>
        <Button variant="outline" onClick={() => modalSend({ type: "BACK" })}>
          Back
        </Button>
      </DialogFooter>
    </>
  )
}
