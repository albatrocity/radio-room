import { Box, Button, HStack, Icon } from "@chakra-ui/react"
import { ClassNames } from "@emotion/react"
import { LuLock, LuLockOpen } from "react-icons/lu"
import { emitToSocket } from "../../../../actors/socketActor"
import { emitTradeCancel } from "../../../../lib/tradeCancelledByMe"
import { useAnimationsEnabled } from "../../../../hooks/useReducedMotion"
import { confirmPulseAnim } from "./tradeDetailConstants"
import { useTradeParticipants } from "./useTradeParticipants"

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
