import { useState } from "react"
import { Box, Button, HStack, Stack, Text } from "@chakra-ui/react"
import type { GiftOffer } from "@repo/types"
import { getUserById } from "../../../actors/usersActor"
import { useCurrentUser } from "../../../hooks/useActors"
import { emitGiftRespond, type GiftRespondAction } from "./giftSocketActions"

function counterpartyLabel(userId: string, me: string | undefined): string {
  if (userId === me) return "you"
  return getUserById(userId)?.username?.trim() || "Someone"
}

export default function PendingGiftsPanel({
  incoming,
  outgoing,
}: {
  incoming: GiftOffer[]
  outgoing: GiftOffer[]
}) {
  const me = useCurrentUser()?.userId
  const [pendingOfferId, setPendingOfferId] = useState<string | null>(null)

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
          <HStack
            key={offer.offerId}
            borderWidth="1px"
            borderColor="border.muted"
            borderRadius="md"
            p={2}
            justify="space-between"
            flexWrap="wrap"
            gap={2}
          >
            <Text fontSize="sm">
              From {counterpartyLabel(offer.fromUserId, me)}: {offer.itemName ?? offer.definitionId}
              {offer.quantity > 1 ? ` ×${offer.quantity}` : ""}
            </Text>
            <HStack gap={1}>
              <Button
                size="xs"
                colorPalette="action"
                loading={pendingOfferId === offer.offerId}
                onClick={() => respond(offer.offerId, "accept")}
              >
                Accept
              </Button>
              <Button
                size="xs"
                variant="outline"
                loading={pendingOfferId === offer.offerId}
                onClick={() => respond(offer.offerId, "decline")}
              >
                Decline
              </Button>
            </HStack>
          </HStack>
        ))}
        {outgoing.map((offer) => (
          <HStack
            key={offer.offerId}
            borderWidth="1px"
            borderColor="border.muted"
            borderRadius="md"
            p={2}
            justify="space-between"
            flexWrap="wrap"
            gap={2}
          >
            <Text fontSize="sm">
              To {counterpartyLabel(offer.toUserId, me)}: {offer.itemName ?? offer.definitionId}
              {offer.quantity > 1 ? ` ×${offer.quantity}` : ""}
            </Text>
            <Button
              size="xs"
              variant="outline"
              loading={pendingOfferId === offer.offerId}
              onClick={() => respond(offer.offerId, "cancel")}
            >
              Cancel
            </Button>
          </HStack>
        ))}
      </Stack>
    </Box>
  )
}
