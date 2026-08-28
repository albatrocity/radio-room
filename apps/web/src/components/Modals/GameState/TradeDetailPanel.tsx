import { useEffect, useMemo, useRef, useState } from "react"
import { useSelector } from "@xstate/react"
import {
  Box,
  Button,
  Circle,
  Float,
  Grid,
  Heading,
  HStack,
  Icon,
  Input,
  ScrollArea,
  Stack,
  Text,
  VStack,
} from "@chakra-ui/react"
import { ClassNames, css, keyframes } from "@emotion/react"
import { LuLock, LuLockOpen, LuThumbsUp } from "react-icons/lu"
import {
  TRADE_MESSAGE_MAX_LENGTH,
  type TradeDraftItem,
  type TradeOfferItem,
  type TradeSession,
} from "@repo/types"
import ItemArtwork from "../../ItemArtwork"
import ScrollShadowViewport from "../../ScrollShadowViewport"
import { useCurrentUser, useUserGameStatePayload } from "../../../hooks/useActors"
import { useIntegratedPanelPresentation } from "../../../hooks/useIntegratedPanelPresentation"
import { useAnimationsEnabled } from "../../../hooks/useReducedMotion"
import { emitToSocket } from "../../../actors/socketActor"
import { getUserById } from "../../../actors/usersActor"
import { emitTradeCancel } from "../../../lib/tradeCancelledByMe"
import { tradeActor } from "../../../actors/tradeActor"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../artworkFrames/frameStyles"

const OFFER_ARTWORK_SIZE = 6
const PICKER_ARTWORK_SIZE = FRAMED_ARTWORK_BOX_SIZE
/** Tall enough for square row art plus chip padding. */
const PICKER_ROW_H = "4.25rem"
const PICKER_ROW_GAP = "0.25rem"

/** Unique name — Chakra/Panda also define `@keyframes pulse` as an opacity fade. */
const kfConfirmPulse = keyframes`
  from, to {
    transform: scale(1);
  }
  50% {
    transform: scale(1.05);
  }
`

const confirmPulseAnim = css`
  animation: ${kfConfirmPulse} 1s ease-in-out infinite;
  display: inline-flex;
  transform-origin: center;
  will-change: transform;
`

function pickerStripHeight(rows: number): string {
  if (rows <= 1) return PICKER_ROW_H
  return `calc(${rows} * ${PICKER_ROW_H} + ${rows - 1} * ${PICKER_ROW_GAP})`
}

type TradeItemDef = {
  name?: string
  imageUrl?: string
  icon?: string
  artworkFrame?: string
  slotPool?: string
}

function offerRows(
  participant: TradeSession["participants"][string] | undefined,
): (TradeOfferItem | TradeDraftItem)[] {
  if (!participant) return []
  if (participant.locked) return participant.offer
  return participant.draft
}

function TradeItemRow({
  name,
  quantity,
  def,
  compact = false,
  onActivate,
  activateLabel,
}: {
  name: string
  quantity: number
  def?: TradeItemDef
  compact?: boolean
  onActivate?: () => void
  activateLabel?: string
}) {
  const boxSize = compact
    ? PICKER_ARTWORK_SIZE
    : def?.slotPool === "collection"
    ? FRAMED_ARTWORK_BOX_SIZE
    : OFFER_ARTWORK_SIZE

  const artwork = compact ? (
    <Box w={PICKER_ARTWORK_SIZE} flexShrink={0}>
      <ItemArtwork
        imageUrl={def?.imageUrl}
        icon={def?.icon as never}
        artworkFrame={def?.artworkFrame as never}
        size="feature"
        boxSize={PICKER_ARTWORK_SIZE}
        alt={name}
        interactive={false}
      />
    </Box>
  ) : (
    <ItemArtwork
      imageUrl={def?.imageUrl}
      icon={def?.icon as never}
      artworkFrame={def?.artworkFrame as never}
      boxSize={boxSize}
      alt={name}
      interactive={false}
    />
  )

  const content = (
    <>
      {artwork}
      <Text fontSize={compact ? "xs" : "sm"} flex="1" minW={0} truncate lineHeight="short">
        {name}
      </Text>
    </>
  )

  const qtyBadge =
    quantity > 1 ? (
      <Float placement="top-start">
        <Circle
          size="5"
          bg="fg"
          color="bg"
          fontSize="2xs"
          fontWeight="semibold"
          pointerEvents="none"
        >
          {quantity}
        </Circle>
      </Float>
    ) : null

  const frame = {
    position: "relative" as const,
    borderWidth: "1px" as const,
    borderRadius: "md" as const,
    p: compact ? 1.5 : 2,
    gap: compact ? 1.5 : 2,
    w: compact ? "auto" : ("full" as const),
    minW: compact ? "8rem" : 0,
    maxW: compact ? "11rem" : undefined,
    h: compact ? "full" : undefined,
    flexShrink: compact ? 0 : undefined,
    align: "center" as const,
    overflow: compact ? "hidden" : undefined,
  }

  if (onActivate) {
    return (
      <HStack
        role="button"
        tabIndex={0}
        aria-label={activateLabel}
        onClick={onActivate}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return
          event.preventDefault()
          onActivate()
        }}
        cursor="pointer"
        _hover={{ bg: "bg.muted" }}
        {...frame}
      >
        {qtyBadge}
        {content}
      </HStack>
    )
  }

  return (
    <HStack {...frame}>
      {qtyBadge}
      {content}
    </HStack>
  )
}

function TradeNoteBubble({ message, typing }: { message?: string | null; typing?: boolean }) {
  const hasMessage = Boolean(message?.trim())
  if (!hasMessage && !typing) return null

  return (
    <Box
      position="relative"
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      bg="bg.subtle"
      px={2}
      py={1.5}
    >
      {hasMessage ? (
        <Text fontSize="xs" whiteSpace="pre-wrap" wordBreak="break-word" opacity={typing ? 0.1 : 1}>
          {message}
        </Text>
      ) : (
        // Reserve a line so typing alone doesn’t jump differently than a short note.
        <Text fontSize="xs" visibility="hidden" aria-hidden>
          typing…
        </Text>
      )}
      {typing ? (
        <Text
          position="absolute"
          inset={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          fontSize="xs"
          color="fg.muted"
          fontStyle="italic"
          pointerEvents="none"
        >
          typing…
        </Text>
      ) : null}
    </Box>
  )
}

function TradeColumn({
  title,
  rows,
  definitionMap,
  note,
  typing,
  locked = false,
  confirmed = false,
  emptyCopy = "Nothing offered.",
  onRemoveFromOffer,
}: {
  title: string
  rows: (TradeOfferItem | TradeDraftItem)[]
  definitionMap: Map<
    string,
    { name?: string; imageUrl?: string; icon?: string; artworkFrame?: string; slotPool?: string }
  >
  note?: string | null
  typing?: boolean
  locked?: boolean
  confirmed?: boolean
  emptyCopy?: string
  onRemoveFromOffer?: (itemId: string) => void
}) {
  return (
    <VStack align="stretch" flex="1" minW={0} gap={2}>
      <HStack gap={1.5} minW={0} align="center">
        <Heading size="sm" truncate minW={0} title={title}>
          {title}
        </Heading>
        {locked ? (
          <Icon
            as={LuLock}
            boxSize={3.5}
            color="fg.muted"
            flexShrink={0}
            aria-label="Offer locked"
          />
        ) : null}
        {confirmed ? (
          <Icon
            as={LuThumbsUp}
            boxSize={3.5}
            color="fg.muted"
            flexShrink={0}
            aria-label="Trade confirmed"
          />
        ) : null}
      </HStack>
      <TradeNoteBubble message={note} typing={typing} />
      <Stack gap={2} minH="8rem">
        {rows.length === 0 && (
          <Text fontSize="sm" color="fg.muted">
            {emptyCopy}
          </Text>
        )}
        {rows.map((row) => {
          const defId = "definitionId" in row ? row.definitionId : ""
          const def = definitionMap.get(defId)
          const name =
            ("itemName" in row && row.itemName) ||
            def?.name ||
            defId ||
            ("itemId" in row ? row.itemId : "")
          const itemId = "itemId" in row ? row.itemId : row.originalItemId
          const key = "escrowKey" in row && row.escrowKey ? row.escrowKey : itemId || name
          return (
            <TradeItemRow
              key={key}
              name={name}
              quantity={row.quantity}
              def={def}
              onActivate={onRemoveFromOffer ? () => onRemoveFromOffer(itemId) : undefined}
              activateLabel={`Remove ${name} from offer`}
            />
          )
        })}
      </Stack>
    </VStack>
  )
}

const TYPING_IDLE_MS = 1500

function useTradeParticipants(tradeId: string) {
  const me = useCurrentUser()
  const payload = useUserGameStatePayload()
  const trade = useSelector(tradeActor, (s) => s.context.trade)

  const activeTrade =
    trade?.tradeId === tradeId
      ? trade
      : payload?.activeTrade?.tradeId === tradeId
      ? payload.activeTrade
      : null

  const myId = me?.userId
  const otherId =
    activeTrade && myId
      ? activeTrade.fromUserId === myId
        ? activeTrade.toUserId
        : activeTrade.fromUserId
      : null
  const otherName = otherId ? getUserById(otherId)?.username?.trim() || "them" : "them"
  const mine = myId && activeTrade ? activeTrade.participants[myId] : undefined
  const theirs = otherId && activeTrade ? activeTrade.participants[otherId] : undefined
  const bothLocked = !!(mine?.locked && theirs?.locked)

  return { activeTrade, payload, myId, otherName, mine, theirs, bothLocked }
}

type SelectableTradeItem = {
  itemId: string
  definitionId: string
  name: string
  quantity: number
}

type PickerUnit = SelectableTradeItem & { unitKey: string }

function useTradeOfferDraft(tradeId: string) {
  const payload = useUserGameStatePayload()
  const myInventory = useSelector(tradeActor, (s) => s.context.myInventory)
  const definitions = useSelector(tradeActor, (s) => s.context.definitions)
  const { activeTrade, mine } = useTradeParticipants(tradeId)

  const definitionMap = useMemo(() => {
    const m = new Map(definitions.map((d) => [d.id, d]))
    for (const d of payload?.itemDefinitions ?? []) m.set(d.id, d)
    return m
  }, [definitions, payload?.itemDefinitions])

  const bagItems = myInventory.length > 0 ? myInventory : payload?.inventory?.items ?? []
  const selectable = useMemo(() => {
    const rows: SelectableTradeItem[] = []
    for (const item of bagItems) {
      const def = definitionMap.get(item.definitionId)
      if (!def?.tradeable) continue
      rows.push({
        itemId: item.itemId,
        definitionId: item.definitionId,
        name: def.name,
        quantity: item.quantity,
      })
    }
    return rows
  }, [bagItems, definitionMap])

  const offeredQtyById = useMemo(() => {
    const m = new Map<string, number>()
    for (const d of mine?.draft ?? []) m.set(d.itemId, d.quantity)
    return m
  }, [mine?.draft])

  const remainingInventory = useMemo(() => {
    const rows: PickerUnit[] = []
    // After lock, escrow already debited the bag — don't subtract draft again.
    const subtractDraft = !mine?.locked
    for (const item of selectable) {
      const offered = subtractDraft ? offeredQtyById.get(item.itemId) ?? 0 : 0
      const left = Math.max(0, item.quantity - offered)
      for (let i = 0; i < left; i++) {
        rows.push({ ...item, quantity: 1, unitKey: `${item.itemId}:${i}` })
      }
    }
    return rows
  }, [selectable, offeredQtyById, mine?.locked])

  const offeredCount = mine?.locked
    ? mine.offer.reduce((n, row) => n + row.quantity, 0)
    : (mine?.draft ?? []).reduce((n, row) => n + row.quantity, 0)
  const canEdit = !!(activeTrade && mine && !mine.locked)

  const emitOffer = (items: { itemId: string; quantity: number }[]) => {
    if (!activeTrade) return
    emitToSocket("TRADE_SET_OFFER", { tradeId: activeTrade.tradeId, items })
  }

  const addToOffer = (itemId: string) => {
    if (!canEdit) return
    const bag = bagItems.find((i) => i.itemId === itemId)
    if (!bag) return
    const current = offeredQtyById.get(itemId) ?? 0
    if (current >= bag.quantity) return
    const items = (mine?.draft ?? []).map((d) => ({ itemId: d.itemId, quantity: d.quantity }))
    const existing = items.find((row) => row.itemId === itemId)
    if (existing) existing.quantity += 1
    else items.push({ itemId, quantity: 1 })
    emitOffer(items)
  }

  const removeFromOffer = (itemId: string) => {
    if (!canEdit) return
    emitOffer(
      (mine?.draft ?? [])
        .map((d) => ({
          itemId: d.itemId,
          quantity: d.itemId === itemId ? d.quantity - 1 : d.quantity,
        }))
        .filter((d) => d.quantity > 0),
    )
  }

  return {
    definitionMap,
    selectable,
    remainingInventory,
    offeredCount,
    canEdit,
    addToOffer,
    removeFromOffer,
  }
}

/** Shared “Say something…” field — pinned in Game State chrome above lock/confirm. */
export function TradeDetailComposer({ tradeId }: { tradeId: string }) {
  const { activeTrade, mine } = useTradeParticipants(tradeId)
  const [draftNote, setDraftNote] = useState("")
  const typingActiveRef = useRef(false)
  const typingIdleTimerRef = useRef<number | null>(null)
  const myPublishedNote = mine?.message ?? null

  useEffect(() => {
    setDraftNote("")
    typingActiveRef.current = false
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current)
      typingIdleTimerRef.current = null
    }
  }, [tradeId])

  useEffect(() => {
    return () => {
      if (typingIdleTimerRef.current != null) {
        window.clearTimeout(typingIdleTimerRef.current)
      }
      if (typingActiveRef.current && activeTrade) {
        emitToSocket("TRADE_TYPING", { tradeId: activeTrade.tradeId, typing: false })
      }
    }
    // Only on unmount / trade change via tradeId effect reset
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId])

  const emitTyping = (typing: boolean) => {
    if (!activeTrade) return
    if (typingActiveRef.current === typing) return
    typingActiveRef.current = typing
    emitToSocket("TRADE_TYPING", { tradeId: activeTrade.tradeId, typing })
  }

  const scheduleTypingIdleClear = () => {
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current)
    }
    typingIdleTimerRef.current = window.setTimeout(() => {
      typingIdleTimerRef.current = null
      emitTyping(false)
    }, TYPING_IDLE_MS)
  }

  const onDraftChange = (value: string) => {
    setDraftNote(value.slice(0, TRADE_MESSAGE_MAX_LENGTH))
    if (value.trim().length > 0) {
      emitTyping(true)
      scheduleTypingIdleClear()
    } else {
      if (typingIdleTimerRef.current != null) {
        window.clearTimeout(typingIdleTimerRef.current)
        typingIdleTimerRef.current = null
      }
      emitTyping(false)
    }
  }

  const publishNote = (raw: string) => {
    if (!activeTrade) return
    if (typingIdleTimerRef.current != null) {
      window.clearTimeout(typingIdleTimerRef.current)
      typingIdleTimerRef.current = null
    }
    emitTyping(false)
    emitToSocket("TRADE_SET_MESSAGE", {
      tradeId: activeTrade.tradeId,
      message: raw.slice(0, TRADE_MESSAGE_MAX_LENGTH),
    })
    setDraftNote("")
  }

  if (!activeTrade) return null

  return (
    <HStack gap={2} align="center" w="full">
      <Input
        size="sm"
        flex="1"
        placeholder="Say something…"
        value={draftNote}
        maxLength={TRADE_MESSAGE_MAX_LENGTH}
        onChange={(e) => onDraftChange(e.target.value)}
        onBlur={() => emitTyping(false)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault()
            publishNote(draftNote)
          }
        }}
      />
      <Button
        size="sm"
        colorPalette="action"
        disabled={!draftNote.trim() && !myPublishedNote}
        onClick={() => publishNote(draftNote)}
      >
        {draftNote.trim() ? "Send" : myPublishedNote ? "Clear" : "Send"}
      </Button>
    </HStack>
  )
}

/** Remaining bag items — pinned in Game State chrome below the compose field. */
export function TradeDetailInventoryPicker({ tradeId }: { tradeId: string }) {
  const { activeTrade } = useTradeParticipants(tradeId)
  const { definitionMap, selectable, remainingInventory, offeredCount, canEdit, addToOffer } =
    useTradeOfferDraft(tradeId)
  const presentation = useIntegratedPanelPresentation()
  const pickerRows = presentation === "panel" ? 2 : 1

  if (!activeTrade) return null

  const emptyCopy =
    selectable.length === 0 && offeredCount === 0
      ? "You have nothing to offer"
      : "You've offered all you have"

  return (
    <Box h={pickerStripHeight(pickerRows)} w="full" minW={0} overflow="hidden">
      <ScrollArea.Root width="full" height="full" size="xs">
        <ScrollShadowViewport
          orientation="horizontal"
          height="full"
          overflowY="hidden"
          css={{ "--scroll-shadow-size": "2rem" }}
        >
          <ScrollArea.Content height="full" minW="full">
            {remainingInventory.length > 0 ? (
              <Grid
                autoFlow="column"
                templateRows={`repeat(${pickerRows}, ${PICKER_ROW_H})`}
                autoColumns="max-content"
                gap={1}
                h="full"
              >
                {remainingInventory.map((item) => (
                  <TradeItemRow
                    key={item.unitKey}
                    name={item.name}
                    quantity={1}
                    def={definitionMap.get(item.definitionId)}
                    compact
                    onActivate={canEdit ? () => addToOffer(item.itemId) : undefined}
                    activateLabel={`Add ${item.name} to offer`}
                  />
                ))}
              </Grid>
            ) : (
              <HStack h="full" align="center" w="full">
                <Text fontSize="xs" color="fg.muted" lineHeight="short">
                  {emptyCopy}
                </Text>
              </HStack>
            )}
          </ScrollArea.Content>
        </ScrollShadowViewport>
      </ScrollArea.Root>
    </Box>
  )
}

function TradeSessionStatus({
  otherName,
  mine,
  theirs,
  bothLocked,
}: {
  otherName: string
  mine: TradeSession["participants"][string] | undefined
  theirs: TradeSession["participants"][string] | undefined
  bothLocked: boolean
}) {
  return (
    <Stack>
      {!mine?.locked && !theirs?.locked && (
        <Text fontSize="sm" color="fg.muted">
          Add items and lock your offer
        </Text>
      )}
      {mine?.locked && !bothLocked && (
        <Text fontSize="sm" color="fg.muted">
          Waiting for {otherName} to lock in their offer.
        </Text>
      )}
      {theirs?.locked && !mine?.locked && (
        <Text fontSize="sm" color="fg.muted">
          {otherName} is waiting for you to lock in your offer.
        </Text>
      )}
      {bothLocked && !mine?.confirmed && !theirs?.confirmed && (
        <Text fontSize="sm" color="fg.muted">
          Both parties have locked in their offers. Confirm the trade or back out.
        </Text>
      )}
      {theirs?.confirmed && !mine?.confirmed && (
        <Text fontSize="sm" color="fg.muted">
          {otherName} has confirmed the trade. Waiting for you to confirm.
        </Text>
      )}
      {mine?.confirmed && !theirs?.confirmed && (
        <Text fontSize="sm" color="fg.muted">
          You have confirmed the trade. Waiting for {otherName} to confirm.
        </Text>
      )}
    </Stack>
  )
}

/** Lock / confirm / cancel — pinned in Game State chrome below the inventory picker. */
export function TradeDetailActions({ tradeId }: { tradeId: string }) {
  const { activeTrade, mine, bothLocked } = useTradeParticipants(tradeId)
  const animationsEnabled = useAnimationsEnabled()
  if (!activeTrade) return null

  const pulseConfirm = bothLocked && !mine?.confirmed && animationsEnabled

  return (
    <HStack justify="space-between" align="center" flexWrap="wrap" gap={2} w="full">
      <Button variant="outline" size="sm" onClick={() => emitTradeCancel(activeTrade.tradeId)}>
        Cancel trade
      </Button>
      <HStack gap={2} flexWrap="wrap" justify="end">
        {mine && !mine.locked && (
          <Button
            size="sm"
            colorPalette="action"
            onClick={() => emitToSocket("TRADE_LOCK", { tradeId: activeTrade.tradeId })}
          >
            <Icon as={LuLock} />
            Lock offer
          </Button>
        )}
        {mine?.locked && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => emitToSocket("TRADE_UNLOCK", { tradeId: activeTrade.tradeId })}
          >
            <Icon as={LuLockOpen} />
            Unlock
          </Button>
        )}
        {bothLocked && (
          <ClassNames>
            {({ css: cx }) => (
              <Box display="inline-flex" className={pulseConfirm ? cx(confirmPulseAnim) : undefined}>
                <Button
                  size="sm"
                  colorPalette="action"
                  disabled={mine?.confirmed}
                  onClick={() => emitToSocket("TRADE_CONFIRM", { tradeId: activeTrade.tradeId })}
                >
                  {mine?.confirmed ? "Waiting…" : "Confirm trade"}
                </Button>
              </Box>
            )}
          </ClassNames>
        )}
      </HStack>
    </HStack>
  )
}

export default function TradeDetailPanel({ tradeId }: { tradeId: string }) {
  const lastError = useSelector(tradeActor, (s) => s.context.lastError)
  const counterpartTyping = useSelector(tradeActor, (s) => s.context.counterpartTyping)
  const { activeTrade, otherName, mine, theirs, bothLocked } = useTradeParticipants(tradeId)
  const { definitionMap, canEdit, removeFromOffer } = useTradeOfferDraft(tradeId)

  const myPublishedNote = mine?.message ?? null

  if (!activeTrade) {
    return (
      <Text fontSize="sm" color="fg.muted">
        Trade session ended or unavailable.
      </Text>
    )
  }

  return (
    <Stack gap={4}>
      {lastError && (
        <Text fontSize="sm" color="red.500">
          {lastError}
        </Text>
      )}
      <TradeSessionStatus
        otherName={otherName}
        mine={mine}
        theirs={theirs}
        bothLocked={bothLocked}
      />
      <HStack align="start" gap={4} flexWrap={{ base: "wrap", md: "nowrap" }}>
        <TradeColumn
          title="You"
          rows={offerRows(mine)}
          definitionMap={definitionMap}
          note={myPublishedNote}
          locked={!!mine?.locked}
          confirmed={!!mine?.confirmed}
          emptyCopy={canEdit ? "Add items to offer from your inventory below" : "Nothing offered."}
          onRemoveFromOffer={canEdit ? removeFromOffer : undefined}
        />
        <TradeColumn
          title={otherName}
          rows={offerRows(theirs)}
          definitionMap={definitionMap}
          note={theirs?.message}
          typing={counterpartTyping}
          locked={!!theirs?.locked}
          confirmed={!!theirs?.confirmed}
        />
      </HStack>
    </Stack>
  )
}
