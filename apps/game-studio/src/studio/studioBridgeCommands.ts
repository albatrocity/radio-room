import * as studioActions from "./studioActions"
import { getStudio } from "./studioEnvironment"

/**
 * Commands forwarded from Listening Room (via studio-bridge) for sandbox execution.
 * Shape must match bridge `STUDIO_BRIDGE_COMMAND` payloads.
 */
export type StudioBridgeCommand =
  | {
      kind: "USE_INVENTORY_ITEM"
      roomId: string
      userId: string
      itemId: string
      targetUserId?: string
      targetQueueItemId?: string
      targetInventoryItemId?: string
      password?: string
      coinAmount?: number
    }
  | { kind: "SELL_INVENTORY_ITEM"; roomId: string; userId: string; itemId: string }
  | { kind: "SEND_MESSAGE"; roomId: string; userId: string; content: string }
  | {
      kind: "EXECUTE_PLUGIN_ACTION"
      roomId: string
      userId: string
      pluginName: string
      action: string
    }

export async function dispatchStudioBridgeCommand(cmd: StudioBridgeCommand): Promise<void> {
  const { room } = getStudio()
  if (cmd.roomId !== room.roomId) return

  switch (cmd.kind) {
    case "USE_INVENTORY_ITEM": {
      const ctx: Record<string, unknown> = {}
      if (cmd.targetUserId != null) ctx.targetUserId = cmd.targetUserId
      if (cmd.targetQueueItemId != null) ctx.targetQueueItemId = cmd.targetQueueItemId
      if (cmd.targetInventoryItemId != null) ctx.targetInventoryItemId = cmd.targetInventoryItemId
      if (cmd.password != null) ctx.password = cmd.password
      if (cmd.coinAmount != null) ctx.coinAmount = cmd.coinAmount
      await studioActions.useInventoryItem(
        cmd.userId,
        cmd.itemId,
        Object.keys(ctx).length > 0 ? ctx : undefined,
      )
      return
    }
    case "SELL_INVENTORY_ITEM": {
      await studioActions.sellInventoryItem(cmd.userId, cmd.itemId)
      return
    }
    case "SEND_MESSAGE": {
      await studioActions.sendChatAsUser(cmd.userId, cmd.content)
      return
    }
    case "EXECUTE_PLUGIN_ACTION": {
      await studioActions.executeBridgePluginAction(cmd.userId, cmd.pluginName, cmd.action)
      return
    }
  }
}
