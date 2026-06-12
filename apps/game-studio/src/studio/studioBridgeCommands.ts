import type { Poll, PollResults } from "@repo/types"
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
      params?: Record<string, unknown>
    }
  | {
      kind: "REMOVE_FROM_QUEUE"
      roomId: string
      userId: string
      trackId: string
      isAdmin: boolean
    }
  | {
      kind: "RETRIEVE_STORED_ARTIFACT"
      roomId: string
      userId: string
      artifactId: string
      password: string
    }
  | { kind: "CAST_POLL_VOTE"; roomId: string; userId: string; pollId: string; optionId: string }
  | { kind: "CLOSE_POLL"; roomId: string; userId: string; pollId: string }
  | {
      kind: "CREATE_POLL"
      roomId: string
      userId: string
      question: string
      options: { label: string }[]
      settings?: { hideRunningTotal?: boolean }
    }
  | { kind: "DELETE_POLL"; roomId: string; userId: string; pollId: string }

/** Returned to studio-bridge when it uses Socket.IO ack. */
export type StudioBridgeCommandResult = {
  success: boolean
  message?: string
  pollId?: string
  optionId?: string
  isSwap?: boolean
  totalVotes?: number | null
  voteReason?: "POLL_CLOSED" | "POLL_NOT_FOUND" | "INVALID_OPTION" | "UNAUTHORIZED"
  poll?: Poll
  closedPoll?: Poll
  results?: PollResults
  deletedPollId?: string
}

export async function dispatchStudioBridgeCommand(
  cmd: StudioBridgeCommand,
): Promise<StudioBridgeCommandResult> {
  const { room } = getStudio()
  if (cmd.roomId !== room.roomId) {
    return { success: false, message: "Wrong room." }
  }

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
      return { success: true }
    }
    case "SELL_INVENTORY_ITEM": {
      await studioActions.sellInventoryItem(cmd.userId, cmd.itemId)
      return { success: true }
    }
    case "SEND_MESSAGE": {
      await studioActions.sendChatAsUser(cmd.userId, cmd.content)
      return { success: true }
    }
    case "EXECUTE_PLUGIN_ACTION": {
      await studioActions.executeBridgePluginAction(
        cmd.userId,
        cmd.pluginName,
        cmd.action,
        cmd.params,
      )
      return { success: true }
    }
    case "REMOVE_FROM_QUEUE": {
      await studioActions.removeQueueTrackForBridge(cmd.userId, cmd.trackId, {
        isAdmin: cmd.isAdmin,
      })
      return { success: true }
    }
    case "RETRIEVE_STORED_ARTIFACT": {
      return studioActions.retrieveArtifact(cmd.artifactId, cmd.password, cmd.userId)
    }
    case "CAST_POLL_VOTE": {
      if (room.activePoll?.id !== cmd.pollId) {
        return { success: false, voteReason: "POLL_NOT_FOUND" }
      }
      const result = studioActions.castStudioPollVote(cmd.userId, cmd.optionId)
      if (!result.ok) {
        return { success: false, voteReason: result.reason }
      }
      return {
        success: true,
        pollId: cmd.pollId,
        optionId: cmd.optionId,
        isSwap: !result.isFirstVote,
        totalVotes: result.totalVotes,
      }
    }
    case "CLOSE_POLL": {
      if (!room.activePoll || room.activePoll.id !== cmd.pollId) {
        return { success: false, message: "Poll not found." }
      }
      const result = studioActions.closeStudioPoll()
      if (!result.ok) {
        return { success: false, message: result.message }
      }
      const entry = room.pollHistory.find((e) => e.poll.id === result.pollId)
      return {
        success: true,
        pollId: result.pollId,
        closedPoll: entry?.poll,
        results: entry?.results,
      }
    }
    case "CREATE_POLL": {
      const result = studioActions.createStudioPoll({
        question: cmd.question,
        options: cmd.options,
        hideRunningTotal: cmd.settings?.hideRunningTotal,
      })
      if (!result.ok) {
        return { success: false, message: result.message }
      }
      return { success: true, poll: result.poll }
    }
    case "DELETE_POLL": {
      const result = studioActions.deleteStudioPoll(cmd.pollId)
      if (!result.ok) {
        return { success: false, message: result.message }
      }
      return { success: true, deletedPollId: cmd.pollId }
    }
  }
}
