import GameStateItemDetail from "./GameStateItemDetail"
import TradeDetailPanel from "./TradeDetailPanel"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"
import type { ItemDefinition } from "@repo/types"
import { isItemDetailFrame, isTradeDetailFrame } from "../../../types/GameStateDetail"

export default function GameStateDetailRouter({
  frame,
  definition,
}: {
  frame: GameStateDetailFrame
  definition?: ItemDefinition
}) {
  if (isTradeDetailFrame(frame)) {
    return <TradeDetailPanel tradeId={frame.tradeId} />
  }
  if (isItemDetailFrame(frame)) {
    return <GameStateItemDetail frame={frame} definition={definition} />
  }
  return null
}
