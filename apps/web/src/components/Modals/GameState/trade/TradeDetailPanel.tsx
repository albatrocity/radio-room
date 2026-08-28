import { HStack, Stack, Text } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"
import type { TradeDraftItem, TradeOfferItem, TradeSession } from "@repo/types"
import { tradeActor } from "../../../../actors/tradeActor"
import { TradeColumn } from "./TradeColumn"
import { TradeSessionStatus } from "./TradeSessionStatus"
import { useTradeOfferDraft } from "./useTradeOfferDraft"
import { useTradeParticipants } from "./useTradeParticipants"

function offerRows(
  participant: TradeSession["participants"][string] | undefined,
): (TradeOfferItem | TradeDraftItem)[] {
  if (!participant) return []
  if (participant.locked) return participant.offer
  return participant.draft
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
