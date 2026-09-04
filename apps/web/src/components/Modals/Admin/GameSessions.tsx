import { useEffect, useRef, useState, useCallback } from "react"
import type { EconomySnapshot, GameSession } from "@repo/types"
import { DEFAULT_SLOT_CAPS } from "@repo/types"
import {
  clampCostScale,
  clampEarnScale,
  median,
  resolveEconomy,
} from "@repo/game-logic"
import {
  Badge,
  Box,
  Button,
  Checkbox,
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
  const panelOpen = modalsState.matches("modal.settings.game_sessions")

  const [sessionName, setSessionName] = useState("")
  const [initialCoinsInput, setInitialCoinsInput] = useState("30")
  const [inventorySlotsInput, setInventorySlotsInput] = useState(String(DEFAULT_SLOT_CAPS.inventory))
  const [collectionSlotsInput, setCollectionSlotsInput] = useState(String(DEFAULT_SLOT_CAPS.collection))
  const [playbackSlotsInput, setPlaybackSlotsInput] = useState(String(DEFAULT_SLOT_CAPS.playback))
  const [allowTrading, setAllowTrading] = useState(false)
  const [physicalMediaWearForAdmins, setPhysicalMediaWearForAdmins] = useState(true)
  const [activeSession, setActiveSession] = useState<GameSession | null>(null)
  const [economySnapshot, setEconomySnapshot] = useState<EconomySnapshot | null>(null)
  const [fedMetrics, setFedMetrics] = useState<{
    affordability: number
    wealth: number
    flowRatio: number
  } | null>(null)
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
      eventTypes: [
        "GAME_SESSION_STATUS",
        "GAME_SESSION_ADMIN_STARTED",
        "GAME_SESSION_ADMIN_ENDED",
        "GAME_SESSION_ADMIN_CONFIG_UPDATED",
        "GAME_SESSION_ADMIN_ECONOMY_UPDATED",
        "GAME_SESSION_STARTED",
        "GAME_SESSION_ENDED",
        "GAME_ECONOMY_SCALE_CHANGED",
        "ERROR_OCCURRED",
        "PLUGIN:the-fed:TICK",
      ],
      send: (event: { type: string; data?: unknown }) => {
        if (event.type === "GAME_SESSION_STATUS") {
          seenStatusRef.current = true
          setStatusLoading(false)
          setLoadError(null)
          const d = event.data as {
            session: GameSession | null
            economySnapshot?: EconomySnapshot | null
          }
          setActiveSession(d.session ?? null)
          setEconomySnapshot(d.economySnapshot ?? null)
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
          setEconomySnapshot(null)
          setFedMetrics(null)
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

        if (event.type === "GAME_SESSION_ADMIN_CONFIG_UPDATED") {
          actionPendingRef.current = false
          setActionLoading(false)
          const d = event.data as { session: GameSession | null }
          if (d.session) {
            setActiveSession(d.session)
          }
          toaster.create({
            title: "Session updated",
            type: "success",
            duration: 3000,
          })
          return
        }

        if (event.type === "GAME_SESSION_ADMIN_ECONOMY_UPDATED") {
          actionPendingRef.current = false
          setActionLoading(false)
          const d = event.data as {
            session: GameSession | null
            economySnapshot?: EconomySnapshot | null
          }
          if (d.session) setActiveSession(d.session)
          if (d.economySnapshot) setEconomySnapshot(d.economySnapshot)
          toaster.create({
            title: "Economy updated",
            type: "success",
            duration: 3000,
          })
          return
        }

        if (event.type === "GAME_ECONOMY_SCALE_CHANGED") {
          const d = event.data as {
            costScale: number
            earnScale: number
            updatedBy?: string
          }
          setActiveSession((prev) => {
            if (!prev) return prev
            const current = resolveEconomy(prev.config.economy)
            return {
              ...prev,
              config: {
                ...prev.config,
                economy: {
                  ...current,
                  costScale: d.costScale,
                  earnScale: d.earnScale,
                },
              },
            }
          })
          return
        }

        if (event.type === "PLUGIN:the-fed:TICK") {
          const d = event.data as {
            affordability?: number
            wealth?: number
            flowRatio?: number
          }
          setFedMetrics({
            affordability: d.affordability ?? 0,
            wealth: d.wealth ?? 0,
            flowRatio: d.flowRatio ?? 0,
          })
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
            setEconomySnapshot(null)
            setFedMetrics(null)
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

    const trimmedCoins = initialCoinsInput.trim()
    let initialCoins: number | undefined
    if (trimmedCoins.length > 0) {
      const parsed = Number(trimmedCoins)
      if (!Number.isFinite(parsed) || parsed < 0) {
        toaster.create({
          title: "Invalid starting coins",
          description: "Enter a non-negative number, or leave blank for 0.",
          type: "warning",
          duration: 3000,
        })
        return
      }
      initialCoins = Math.floor(parsed)
    }

    const parseSlots = (raw: string, label: string): number | undefined => {
      const trimmed = raw.trim()
      if (!trimmed) return undefined
      const parsed = Number(trimmed)
      if (!Number.isFinite(parsed) || parsed < 0) {
        toaster.create({
          title: `Invalid ${label}`,
          description: "Enter a non-negative number, or leave blank for the default.",
          type: "warning",
          duration: 3000,
        })
        return Number.NaN
      }
      return Math.floor(parsed)
    }
    const maxInventorySlots = parseSlots(inventorySlotsInput, "inventory slots")
    if (Number.isNaN(maxInventorySlots)) return
    const maxCollectionSlots = parseSlots(collectionSlotsInput, "collection slots")
    if (Number.isNaN(maxCollectionSlots)) return
    const maxPlaybackSlots = parseSlots(playbackSlotsInput, "playback slots")
    if (Number.isNaN(maxPlaybackSlots)) return

    actionPendingRef.current = true
    setActionLoading(true)
    emitToSocket("START_GAME_SESSION", {
      name,
      ...(initialCoins != null ? { initialCoins } : {}),
      ...(maxInventorySlots != null ? { maxInventorySlots } : {}),
      ...(maxCollectionSlots != null ? { maxCollectionSlots } : {}),
      ...(maxPlaybackSlots != null ? { maxPlaybackSlots } : {}),
      allowTrading,
      physicalMediaWearForAdmins,
    })
  }

  const endSession = () => {
    actionPendingRef.current = true
    setActionLoading(true)
    emitToSocket("END_GAME_SESSION", {})
  }

  const toggleActiveAllowTrading = (checked: boolean) => {
    actionPendingRef.current = true
    setActionLoading(true)
    emitToSocket("UPDATE_GAME_SESSION_CONFIG", { allowTrading: checked })
  }

  const toggleActiveWearForAdmins = (checked: boolean) => {
    actionPendingRef.current = true
    setActionLoading(true)
    emitToSocket("UPDATE_GAME_SESSION_CONFIG", { physicalMediaWearForAdmins: checked })
  }

  const patchEconomy = (patch: { costScale?: number; earnScale?: number }) => {
    actionPendingRef.current = true
    setActionLoading(true)
    emitToSocket("SET_ECONOMY_SCALE", patch)
  }

  const startedLabel =
    activeSession != null ? format(new Date(activeSession.startedAt), "MMM d, yyyy · h:mm a") : ""

  const startingCoins =
    activeSession != null && activeSession.config.enabledAttributes.includes("coin")
      ? activeSession.config.initialValues.coin
      : undefined

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
            <Box
              borderWidth="1px"
              borderColor="border.muted"
              borderRadius="lg"
              p={4}
              bg="bg.subtle"
            >
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
                    {startingCoins != null && (
                      <Text fontSize="sm" color="fg.muted">
                        Starting coins: {startingCoins}
                      </Text>
                    )}
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
                <Checkbox.Root
                  checked={activeSession.config.allowTrading === true}
                  onCheckedChange={(d) => toggleActiveAllowTrading(!!d.checked)}
                  disabled={actionLoading || statusLoading}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Allow gifting and trading</Checkbox.Label>
                </Checkbox.Root>
                <Text fontSize="xs" color="fg.muted" mt={-2}>
                  Disabling cancels pending gifts, trade invites, and active trades.
                </Text>
                <Checkbox.Root
                  checked={activeSession.config.physicalMediaWearForAdmins !== false}
                  onCheckedChange={(d) => toggleActiveWearForAdmins(!!d.checked)}
                  disabled={actionLoading || statusLoading}
                >
                  <Checkbox.HiddenInput />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Admins wear Physical Media when queuing</Checkbox.Label>
                </Checkbox.Root>
                <Text fontSize="xs" color="fg.muted" mt={-2}>
                  When off, room admins can queue from their records without degrading them.
                </Text>

                {(() => {
                  const economy = resolveEconomy(activeSession.config.economy)
                  const wealth =
                    fedMetrics?.wealth ??
                    (economySnapshot ? median(economySnapshot.balances) : null)
                  const affordability = fedMetrics?.affordability
                  const flowRatio = fedMetrics?.flowRatio
                  const fmt = (n: number, digits = 2) =>
                    Number.isFinite(n) ? n.toFixed(digits) : "—"
                  return (
                    <Box pt={2}>
                      <Text fontWeight="semibold" fontSize="sm" mb={2}>
                        Economy
                      </Text>
                      <VStack align="stretch" gap={2}>
                        {(["costScale", "earnScale"] as const).map((key) => {
                          const value = economy[key]
                          const nudge = (factor: number) => {
                            const next =
                              key === "costScale"
                                ? clampCostScale(value * factor)
                                : clampEarnScale(value * factor)
                            patchEconomy({ [key]: next })
                          }
                          return (
                            <HStack key={key} gap={2} flexWrap="wrap">
                              <Text fontSize="sm" minW="6.5rem">
                                {key === "costScale" ? "Cost scale" : "Earn scale"}
                              </Text>
                              <Input
                                type="number"
                                step={0.05}
                                min={0.25}
                                max={key === "costScale" ? 8 : 4}
                                width="5.5rem"
                                value={String(value)}
                                disabled={actionLoading || statusLoading}
                                onChange={(e) => {
                                  const parsed = Number(e.target.value)
                                  if (!Number.isFinite(parsed)) return
                                  setActiveSession((prev) => {
                                    if (!prev) return prev
                                    const current = resolveEconomy(prev.config.economy)
                                    return {
                                      ...prev,
                                      config: {
                                        ...prev.config,
                                        economy: { ...current, [key]: parsed },
                                      },
                                    }
                                  })
                                }}
                                onBlur={(e) => {
                                  const parsed = Number(e.target.value)
                                  if (!Number.isFinite(parsed) || parsed === value) return
                                  patchEconomy({ [key]: parsed })
                                }}
                              />
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={actionLoading || statusLoading}
                                onClick={() => nudge(0.9)}
                              >
                                ×0.9
                              </Button>
                              <Button
                                size="xs"
                                variant="outline"
                                disabled={actionLoading || statusLoading}
                                onClick={() => nudge(1.1)}
                              >
                                ×1.1
                              </Button>
                            </HStack>
                          )
                        })}
                        <HStack gap={2}>
                          <Button
                            size="xs"
                            variant="outline"
                            disabled={actionLoading || statusLoading}
                            onClick={() => patchEconomy({ costScale: 1, earnScale: 1 })}
                          >
                            Reset to 1.0
                          </Button>
                        </HStack>
                        <Text fontSize="xs" color="fg.muted">
                          Affordability {affordability != null ? fmt(affordability) : "—"} · Median
                          wealth {wealth != null ? fmt(wealth, 0) : "—"} · Coins/player/min{" "}
                          {flowRatio != null ? fmt(flowRatio) : "—"}
                        </Text>
                      </VStack>
                    </Box>
                  )
                })()}
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
              disabled={actionLoading || statusLoading}
            />
            <Field.HelperText>
              Uses default attributes (score, coin) and leaderboards. If a session is already
              running, it will be ended first.
            </Field.HelperText>
          </Field.Root>

          <Field.Root>
            <Field.Label>Starting coin balance</Field.Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={initialCoinsInput}
              onChange={(e) => setInitialCoinsInput(e.target.value)}
              placeholder="30"
              disabled={actionLoading || statusLoading}
            />
            <Field.HelperText>
              Each user starts the session with this many coins. Default 30 is three common items
              at the economy ladder (affordability target 3). Leave blank for 0.
            </Field.HelperText>
          </Field.Root>

          <Field.Root>
            <Field.Label>Inventory slots</Field.Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={inventorySlotsInput}
              onChange={(e) => setInventorySlotsInput(e.target.value)}
              disabled={actionLoading || statusLoading}
            />
            <Field.HelperText>
              Consumable / tool bag size. Default is {DEFAULT_SLOT_CAPS.inventory}.
            </Field.HelperText>
          </Field.Root>

          <Field.Root>
            <Field.Label>Collection slots</Field.Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={collectionSlotsInput}
              onChange={(e) => setCollectionSlotsInput(e.target.value)}
              disabled={actionLoading || statusLoading}
            />
            <Field.HelperText>
              Durable Physical Media holdings. Default is {DEFAULT_SLOT_CAPS.collection}.
            </Field.HelperText>
          </Field.Root>

          <Field.Root>
            <Field.Label>Playback slots</Field.Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={playbackSlotsInput}
              onChange={(e) => setPlaybackSlotsInput(e.target.value)}
              disabled={actionLoading || statusLoading}
            />
            <Field.HelperText>
              Playback devices (CD player, turntable, …). Default is {DEFAULT_SLOT_CAPS.playback}.
            </Field.HelperText>
          </Field.Root>

          <Checkbox.Root
            checked={allowTrading}
            onCheckedChange={(d) => setAllowTrading(!!d.checked)}
            disabled={actionLoading || statusLoading}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label>Allow gifting and trading</Checkbox.Label>
          </Checkbox.Root>
          <Text fontSize="xs" color="fg.muted" mt={-2}>
            Listeners can gift items and open two-party trades while the session is active.
          </Text>

          <Checkbox.Root
            checked={physicalMediaWearForAdmins}
            onCheckedChange={(d) => setPhysicalMediaWearForAdmins(!!d.checked)}
            disabled={actionLoading || statusLoading}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label>Admins wear Physical Media when queuing</Checkbox.Label>
          </Checkbox.Root>
          <Text fontSize="xs" color="fg.muted" mt={-2}>
            When off, room admins can queue from their records without degrading them.
          </Text>

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
