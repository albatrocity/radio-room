import type { PollsPluginAPI } from "@repo/types"
import { PluginCapability } from "./PluginCapability"

/** Scoped poll access for one plugin (ADR 0152, ADR 0201). */
export class PluginPollsAPI extends PluginCapability implements PollsPluginAPI {
  async createPoll(params: {
    roomId: string
    userId: string
    question: string
    options: { label: string }[]
    settings?: { hideRunningTotal?: boolean }
    closesAt?: number | null
    durationMs?: number | null
    announce?: boolean
  }) {
    if (!this.pluginName) {
      return {
        ok: false as const,
        error: {
          status: 403,
          error: "Forbidden",
          message: "Plugin identity is required.",
        },
      }
    }
    const { createPoll } = await import("../../operations/polls")
    return createPoll({
      context: this.context,
      roomId: params.roomId,
      userId: params.userId,
      question: params.question,
      options: params.options,
      settings: params.settings,
      closesAt: params.closesAt,
      durationMs: params.durationMs,
      announce: params.announce,
      source: { pluginName: this.pluginName },
    })
  }

  async closePoll(params: { roomId: string; userId: string; pollId: string; announce?: boolean }) {
    if (!this.pluginName) {
      return {
        ok: false as const,
        error: {
          status: 403,
          error: "Forbidden",
          message: "Plugin identity is required.",
        },
      }
    }
    const { closePoll } = await import("../../operations/polls")
    return closePoll({
      context: this.context,
      roomId: params.roomId,
      userId: params.userId,
      pollId: params.pollId,
      announce: params.announce,
      source: { pluginName: this.pluginName },
    })
  }

  async getActivePoll(roomId: string) {
    const { getActivePollId, getPoll } = await import("../../operations/data")
    const pollId = await getActivePollId({ context: this.context, roomId })
    if (!pollId) return null
    return getPoll({ context: this.context, roomId, pollId })
  }

  async getPollVoterIds(roomId: string, pollId: string): Promise<string[]> {
    const { getPollVoterIds } = await import("../../operations/data")
    return getPollVoterIds({ context: this.context, roomId, pollId })
  }

  async getPollVotes(roomId: string, pollId: string): Promise<Record<string, string>> {
    const { getPollVotes } = await import("../../operations/data")
    return getPollVotes({ context: this.context, roomId, pollId })
  }

  async tallyPoll(
    pollId: string,
    options?: { excludeUserIds?: string[] },
  ): Promise<Record<string, number>> {
    if (!this.roomId) return {}
    const { tallyPoll } = await import("../../operations/polls")
    return tallyPoll({
      context: this.context,
      roomId: this.roomId,
      pollId,
      excludeUserIds: options?.excludeUserIds,
    })
  }
}

