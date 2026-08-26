import { useMemo } from "react"
import { useSelector } from "@xstate/react"
import { Box, Button, Checkbox, Heading, HStack, Stack, Text, VStack } from "@chakra-ui/react"
import type { TradeDraftItem, TradeOfferItem, TradeSession } from "@repo/types"
import ItemArtwork from "../../ItemArtwork"
import { useCurrentUser, useUserGameStatePayload } from "../../../hooks/useActors"
import { emitToSocket } from "../../../actors/socketActor"
import { getUserById } from "../../../actors/usersActor"
import { emitTradeCancel } from "../../../lib/tradeCancelledByMe"
import { tradeActor } from "../../../actors/tradeActor"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../artworkFrames/frameStyles"

function offerRows(
  participant: TradeSession["participants"][string] | undefined,
): (TradeOfferItem | TradeDraftItem)[] {
  if (!participant) return []
  if (participant.locked) return participant.offer
  return participant.draft
}

function TradeColumn({
  title,
  rows,
  definitionMap,
  selectable,
  selectedIds,
  onToggle,
}: {
  title: string
  rows: (TradeOfferItem | TradeDraftItem)[]
  definitionMap: Map<
    string,
    { name?: string; imageUrl?: string; icon?: string; artworkFrame?: string; slotPool?: string }
  >
  selectable?: { itemId: string; definitionId: string; name: string; quantity: number }[]
  selectedIds?: Set<string>
  onToggle?: (itemId: string) => void
}) {
  return (
    <VStack align="stretch" flex="1" minW={0} gap={2}>
      <Heading size="sm">{title}</Heading>
      <Stack gap={2} minH="8rem">
        {rows.length === 0 && (
          <Text fontSize="sm" color="fg.muted">
            Nothing offered
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
          const key =
            "escrowKey" in row && row.escrowKey
              ? row.escrowKey
              : "itemId" in row
              ? row.itemId
              : name
          return (
            <HStack key={key} borderWidth="1px" borderRadius="md" p={2} gap={2}>
              <ItemArtwork
                imageUrl={def?.imageUrl}
                icon={def?.icon as never}
                artworkFrame={def?.artworkFrame as never}
                boxSize={def?.slotPool === "collection" ? FRAMED_ARTWORK_BOX_SIZE : 6}
                alt={name}
              />
              <Text fontSize="sm" flex="1" truncate>
                {name}
                {row.quantity > 1 ? ` ×${row.quantity}` : ""}
              </Text>
            </HStack>
          )
        })}
      </Stack>
      {selectable && onToggle && selectedIds && (
        <Box>
          <Text fontSize="xs" color="fg.muted" mb={1}>
            Add from your inventory
          </Text>
          <Stack gap={1} maxH="12rem" overflowY="auto">
            {selectable.map((item) => (
              <Checkbox.Root
                key={item.itemId}
                checked={selectedIds.has(item.itemId)}
                onCheckedChange={() => onToggle(item.itemId)}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label>
                  {item.name}
                  {item.quantity > 1 ? ` ×${item.quantity}` : ""}
                </Checkbox.Label>
              </Checkbox.Root>
            ))}
          </Stack>
        </Box>
      )}
    </VStack>
  )
}

export default function TradeDetailPanel({ tradeId }: { tradeId: string }) {
  const me = useCurrentUser()
  const payload = useUserGameStatePayload()
  const trade = useSelector(tradeActor, (s) => s.context.trade)
  const lastError = useSelector(tradeActor, (s) => s.context.lastError)
  const myInventory = useSelector(tradeActor, (s) => s.context.myInventory)
  const definitions = useSelector(tradeActor, (s) => s.context.definitions)

  const activeTrade =
    trade?.tradeId === tradeId
      ? trade
      : payload?.activeTrade?.tradeId === tradeId
      ? payload.activeTrade
      : null

  const definitionMap = useMemo(() => {
    const m = new Map(definitions.map((d) => [d.id, d]))
    for (const d of payload?.itemDefinitions ?? []) m.set(d.id, d)
    return m
  }, [definitions, payload?.itemDefinitions])

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

  const bagItems = myInventory.length > 0 ? myInventory : payload?.inventory?.items ?? []
  const selectable = bagItems
    .map((item) => {
      const def = definitionMap.get(item.definitionId)
      if (!def?.tradeable) return null
      return {
        itemId: item.itemId,
        definitionId: item.definitionId,
        name: def.name,
        quantity: item.quantity,
      }
    })
    .filter(Boolean) as { itemId: string; definitionId: string; name: string; quantity: number }[]

  const selectedIds = useMemo(() => {
    const set = new Set<string>()
    for (const d of mine?.draft ?? []) set.add(d.itemId)
    return set
  }, [mine?.draft])

  const toggleItem = (itemId: string) => {
    if (!activeTrade || !mine || mine.locked) return
    const next = new Set(selectedIds)
    if (next.has(itemId)) next.delete(itemId)
    else next.add(itemId)
    const items = [...next].map((id) => {
      const bag = bagItems.find((i) => i.itemId === id)
      return { itemId: id, quantity: Math.min(1, bag?.quantity ?? 1) }
    })
    emitToSocket("TRADE_SET_OFFER", { tradeId: activeTrade.tradeId, items })
  }

  const bothLocked = !!(mine?.locked && theirs?.locked)

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
      <HStack align="start" gap={4} flexWrap={{ base: "wrap", md: "nowrap" }}>
        <TradeColumn
          title="You"
          rows={offerRows(mine)}
          definitionMap={definitionMap}
          selectable={mine && !mine.locked ? selectable : undefined}
          selectedIds={selectedIds}
          onToggle={toggleItem}
        />
        <TradeColumn title="Them" rows={offerRows(theirs)} definitionMap={definitionMap} />
      </HStack>
      <Stack align="flex-end">
        {mine?.locked && !bothLocked && (
          <Text fontSize="sm" color="fg.muted">
            Waiting for {otherName} to lock in their offer.
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
      <HStack gap={2} justify="end" flexWrap="wrap" w="full">
        <Button variant="outline" size="sm" onClick={() => emitTradeCancel(activeTrade.tradeId)}>
          Cancel trade
        </Button>
        {mine && !mine.locked && (
          <Button
            size="sm"
            colorPalette="action"
            onClick={() => emitToSocket("TRADE_LOCK", { tradeId: activeTrade.tradeId })}
          >
            Lock offer
          </Button>
        )}
        {mine?.locked && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => emitToSocket("TRADE_UNLOCK", { tradeId: activeTrade.tradeId })}
          >
            Unlock
          </Button>
        )}
        {bothLocked && (
          <Button
            size="sm"
            colorPalette="action"
            disabled={mine?.confirmed}
            onClick={() => emitToSocket("TRADE_CONFIRM", { tradeId: activeTrade.tradeId })}
          >
            {mine?.confirmed ? "Waiting…" : "Confirm trade"}
          </Button>
        )}
      </HStack>
    </Stack>
  )
}
