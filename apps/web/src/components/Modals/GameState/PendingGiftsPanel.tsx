import { useState, type ReactNode } from "react"
import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react"
import type { GiftOffer, ItemDefinition } from "@repo/types"
import { resolveSlotPool } from "@repo/types"
import { useCurrentUser } from "../../../hooks/useActors"
import { counterpartyLabel } from "../../../lib/listenerDisplayName"
import { useUserGameState } from "../UserGameStateContext"
import ItemArtwork from "../../ItemArtwork"
import { FRAMED_ARTWORK_BOX_SIZE } from "../../artworkFrames/frameStyles"
import { emitGiftRespond, type GiftRespondAction } from "../../../lib/giftSocketActions"

function GiftOfferRow({
  offer,
  me,
  definition,
  direction,
  actions,
}: {
  offer: GiftOffer
  me: string | undefined
  definition?: ItemDefinition
  direction: "incoming" | "outgoing"
  actions: ReactNode
}) {
  const counterpartId = direction === "incoming" ? offer.fromUserId : offer.toUserId
  const name = offer.itemName ?? definition?.name ?? offer.definitionId
  const label = `${direction === "incoming" ? "From" : "To"} ${counterpartyLabel(
    counterpartId,
    me,
  )}: ${name}${offer.quantity > 1 ? ` ×${offer.quantity}` : ""}`

  return (
    <HStack
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      p={2}
      align="center"
      justify="space-between"
      gap={3}
    >
      <Stack gap={2} align="start" flex="1" minW={0}>
        <Text fontSize="sm">{label}</Text>
        <HStack gap={1}>{actions}</HStack>
      </Stack>
      <ItemArtwork
        imageUrl={definition?.imageUrl}
        imageUrlLarge={definition?.imageUrlLarge}
        icon={definition?.icon}
        rarity={definition?.rarity}
        artworkFrame={definition?.artworkFrame}
        boxSize={resolveSlotPool(definition) === "collection" ? FRAMED_ARTWORK_BOX_SIZE : 7}
        alt={name}
      />
    </HStack>
  )
}

export default function PendingGiftsPanel({
  incoming,
  outgoing,
}: {
  incoming: GiftOffer[]
  outgoing: GiftOffer[]
}) {
  const me = useCurrentUser()?.userId
  const gameState = useUserGameState()
  const [pendingOfferId, setPendingOfferId] = useState<string | null>(null)
  const definitionMap = gameState?.definitionMap

  if (incoming.length === 0 && outgoing.length === 0) return null

  const respond = (offerId: string, action: "accept" | "decline" | "cancel") => {
    const socketAction: GiftRespondAction =
      action === "accept" ? "ACCEPT_GIFT" : action === "decline" ? "DECLINE_GIFT" : "CANCEL_GIFT"
    setPendingOfferId(offerId)
    emitGiftRespond(socketAction, offerId, {
      onDone: () => setPendingOfferId(null),
      errorTitle: action === "accept" ? "Could not accept gift" : "Gift",
    })
  }

  return (
    <Box>
      <Stack gap={2}>
        {incoming.map((offer) => (
          <GiftOfferRow
            key={offer.offerId}
            offer={offer}
            me={me}
            definition={definitionMap?.get(offer.definitionId)}
            direction="incoming"
            actions={
              <>
                <Button
                  colorPalette="action"
                  loading={pendingOfferId === offer.offerId}
                  onClick={() => respond(offer.offerId, "accept")}
                >
                  Accept
                </Button>
                <Button
                  variant="outline"
                  loading={pendingOfferId === offer.offerId}
                  onClick={() => respond(offer.offerId, "decline")}
                >
                  Decline
                </Button>
              </>
            }
          />
        ))}
        {outgoing.map((offer) => (
          <GiftOfferRow
            key={offer.offerId}
            offer={offer}
            me={me}
            definition={definitionMap?.get(offer.definitionId)}
            direction="outgoing"
            actions={
              <Button
                size="xs"
                variant="outline"
                loading={pendingOfferId === offer.offerId}
                onClick={() => respond(offer.offerId, "cancel")}
              >
                Cancel
              </Button>
            }
          />
        ))}
      </Stack>
    </Box>
  )
}
