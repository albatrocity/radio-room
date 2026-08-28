import { useSelector } from "@xstate/react"
import { useCurrentUser, useUserGameStatePayload } from "../../../../hooks/useActors"
import { getUserById } from "../../../../actors/usersActor"
import { tradeActor } from "../../../../actors/tradeActor"

export function useTradeParticipants(tradeId: string) {
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
