import { useMemo } from "react"
import { Box, Button, Heading, HStack, Stack, Text, VStack } from "@chakra-ui/react"
import { PLAYER_TRANSFER_TTL_MS, type TradeInvite, type TradeSession } from "@repo/types"
import { emitToSocket } from "../../../actors/socketActor"
import { getUserById } from "../../../actors/usersActor"
import { useCurrentUser } from "../../../hooks/useActors"
import { TRADES_GIFTS_TAB } from "../../../constants/gameStateTabs"
import { useUserGameState } from "../UserGameStateContext"
import { InventoryTargetUserPopover } from "./TargetUserPicker"
import PendingGiftsPanel from "./PendingGiftsPanel"
import { useOpenTabDetail } from "./useOpenTabDetail"
import { emitTradeInviteCancel, emitTradeInviteRespond } from "../../../lib/tradeSocketActions"
import { LuChevronRight } from "react-icons/lu"

function formatTimeRemaining(createdAt: number): string {
  const remaining = createdAt + PLAYER_TRANSFER_TTL_MS - Date.now()
  if (remaining <= 0) return "Expired"
  const mins = Math.ceil(remaining / 60_000)
  return `${mins}m left`
}

function counterpartyLabel(userId: string, me: string | undefined): string {
  if (userId === me) return "you"
  return getUserById(userId)?.username?.trim() || "Someone"
}

function inviteSummary(
  invite: TradeInvite,
  me: string | undefined,
  direction: "incoming" | "outgoing",
) {
  const other = direction === "incoming" ? invite.fromUserId : invite.toUserId
  const prefix = direction === "incoming" ? "From" : "(Pending) To"
  return `${prefix} ${counterpartyLabel(other, me)} · ${formatTimeRemaining(invite.createdAt)}`
}

function activeTradeSummary(trade: TradeSession, me: string | undefined): string {
  const other = trade.fromUserId === me ? trade.toUserId : trade.fromUserId
  const mine = me ? trade.participants[me] : undefined
  const theirs = other ? trade.participants[other] : undefined
  if (mine?.locked && theirs?.locked) {
    return mine.confirmed && theirs.confirmed
      ? "Completing…"
      : mine.confirmed
      ? "Waiting for confirm"
      : "Both locked — confirm"
  }
  if (mine?.locked || theirs?.locked) return "Locked — negotiating"
  return "Negotiating"
}

function TradeInviteRow({
  invite,
  me,
  direction,
  onAccept,
}: {
  invite: TradeInvite
  me: string | undefined
  direction: "incoming" | "outgoing"
  onAccept?: (invite: TradeInvite) => void
}) {
  return (
    <HStack
      borderWidth="1px"
      borderColor="border.muted"
      borderRadius="md"
      p={2}
      justify="space-between"
      flexWrap="wrap"
      gap={2}
    >
      <Text fontSize="sm">{inviteSummary(invite, me, direction)}</Text>
      <HStack gap={1}>
        {direction === "incoming" ? (
          <>
            <Button size="xs" colorPalette="action" onClick={() => onAccept?.(invite)}>
              Accept
            </Button>
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                emitTradeInviteRespond({
                  inviteId: invite.inviteId,
                  fromUserId: invite.fromUserId,
                  toUserId: invite.toUserId,
                  accept: false,
                })
              }
            >
              Decline
            </Button>
          </>
        ) : (
          <Button
            size="xs"
            variant="outline"
            onClick={() => emitTradeInviteCancel(invite.inviteId)}
          >
            Cancel
          </Button>
        )}
      </HStack>
    </HStack>
  )
}

export default function TradesGiftsTab() {
  const gameState = useUserGameState()
  const me = useCurrentUser()?.userId
  const openDetail = useOpenTabDetail(TRADES_GIFTS_TAB)

  const activeTrade = gameState?.activeTrade ?? null
  const invites = gameState?.pendingTradeInvites
  const pendingGifts = gameState?.pendingGifts

  const activeLabel = useMemo(() => {
    if (!activeTrade) return null
    const other = activeTrade.fromUserId === me ? activeTrade.toUserId : activeTrade.fromUserId
    return `Trade with ${counterpartyLabel(other, me)} · ${activeTradeSummary(activeTrade, me)}`
  }, [activeTrade, me])

  const openActiveTrade = () => {
    if (!activeTrade) return
    const other = activeTrade.fromUserId === me ? activeTrade.toUserId : activeTrade.fromUserId
    openDetail({
      kind: "trade",
      tradeId: activeTrade.tradeId,
      title: `Trade with ${counterpartyLabel(other, me)}`,
    })
  }

  const acceptInvite = (invite: TradeInvite) => {
    emitTradeInviteRespond({
      inviteId: invite.inviteId,
      fromUserId: invite.fromUserId,
      toUserId: invite.toUserId,
      accept: true,
      onAccepted: ({ tradeId }) => {
        openDetail({
          kind: "trade",
          tradeId,
          title: `Trade with ${counterpartyLabel(invite.fromUserId, me)}`,
        })
      },
    })
  }

  return (
    <VStack align="stretch" gap={4} pt={2}>
      <Box>
        <Heading size="sm">Trades</Heading>

        {activeTrade && activeLabel && (
          <Button
            variant="solid"
            colorPalette="action"
            width="full"
            justifyContent="space-between"
            gap={2}
            mb={2}
            minW={0}
            overflow="hidden"
            onClick={openActiveTrade}
            title={activeLabel}
          >
            <Text as="span" truncate minW={0} flex="1" textAlign="start">
              {activeLabel}
            </Text>
            <Box as="span" flexShrink={0} display="inline-flex">
              <LuChevronRight size={16} />
            </Box>
          </Button>
        )}

        <Stack gap={2}>
          {invites?.incoming.map((invite) => (
            <TradeInviteRow
              key={invite.inviteId}
              invite={invite}
              me={me}
              direction="incoming"
              onAccept={acceptInvite}
            />
          ))}
          {invites?.outgoing.map((invite) => (
            <TradeInviteRow key={invite.inviteId} invite={invite} me={me} direction="outgoing" />
          ))}
          {!activeTrade &&
            (invites?.incoming.length ?? 0) === 0 &&
            (invites?.outgoing.length ?? 0) === 0 && (
              <Stack>
                <Text fontSize="sm" color="fg.muted">
                  No trade invites or active trades.
                </Text>
                <InventoryTargetUserPopover
                  includeSelf={false}
                  placeholder="Trade with…"
                  size="sm"
                  onPick={(toUserId) => emitToSocket("TRADE_INVITE", { toUserId })}
                >
                  <Button size="sm" variant="solid">
                    Request a trade…
                  </Button>
                </InventoryTargetUserPopover>
              </Stack>
            )}
        </Stack>
      </Box>

      <Box>
        <Heading size="sm" mb={2}>
          Gifts
        </Heading>
        {pendingGifts ? (
          <PendingGiftsPanel incoming={pendingGifts.incoming} outgoing={pendingGifts.outgoing} />
        ) : null}
        {pendingGifts &&
          pendingGifts.incoming.length === 0 &&
          pendingGifts.outgoing.length === 0 && (
            <Text fontSize="sm" color="fg.muted">
              No pending gifts.
            </Text>
          )}
      </Box>
    </VStack>
  )
}
