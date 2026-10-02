import GameStateItemDetail from "./GameStateItemDetail"
import TradeDetailPanel from "./TradeDetailPanel"
import PluginDetailFrame from "./PluginDetailFrame"
import type { GameStateDetailFrame } from "../../../types/GameStateDetail"
import type { ItemDefinition } from "@repo/types"
import {
  isItemDetailFrame,
  isPluginDetailFrame,
  isTradeDetailFrame,
} from "../../../types/GameStateDetail"

export default function GameStateDetailRouter({
  frame,
  definition,
  fillHeight = false,
}: {
  frame: GameStateDetailFrame
  definition?: ItemDefinition
  fillHeight?: boolean
}) {
  if (isTradeDetailFrame(frame)) {
    return <TradeDetailPanel tradeId={frame.tradeId} />
  }
  if (isPluginDetailFrame(frame)) {
    return <PluginDetailFrame frame={frame} />
  }
  if (isItemDetailFrame(frame)) {
    return (
      <GameStateItemDetail frame={frame} definition={definition} fillHeight={fillHeight} />
    )
  }
  return null
}
