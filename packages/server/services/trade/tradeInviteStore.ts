import type { RedisContext, TradeInvite } from "@repo/types"
import { PLAYER_TRANSFER_TTL_MS } from "@repo/types"
import { hydrateIndexedJson } from "../../lib/hydrateIndexedJson"
import {
  inviteInIndexKey,
  inviteKey,
  inviteOutIndexKey,
  allInvitesKey,
  isInviteExpired,
} from "./tradeKeys"

type InviteCancelReason = "sender" | "session_end" | "user_left" | "trading_disabled"

/**
 * Redis + in-process TTL for trade invites (ADR 0115).
 * Domain events are emitted by operations via `onExpired`.
 */
export class TradeInviteStore {
  private readonly inviteExpiryTimers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(
    private readonly redis: RedisContext,
    private readonly onExpired: (invite: TradeInvite) => Promise<void>,
  ) {}

  async getInvite(roomId: string, inviteId: string): Promise<TradeInvite | null> {
    const raw = await this.redis.pubClient.get(inviteKey(roomId, inviteId))
    if (!raw) return null
    try {
      return JSON.parse(raw) as TradeInvite
    } catch {
      return null
    }
  }

  async listIncomingInvites(roomId: string, userId: string): Promise<TradeInvite[]> {
    return this.listInvitesByIndex(roomId, inviteInIndexKey(roomId, userId))
  }

  async listOutgoingInvites(roomId: string, userId: string): Promise<TradeInvite[]> {
    return this.listInvitesByIndex(roomId, inviteOutIndexKey(roomId, userId))
  }

  async persistInvite(invite: TradeInvite): Promise<void> {
    await this.redis.pubClient.set(inviteKey(invite.roomId, invite.inviteId), JSON.stringify(invite))
    await this.redis.pubClient.sAdd(
      inviteOutIndexKey(invite.roomId, invite.fromUserId),
      invite.inviteId,
    )
    await this.redis.pubClient.sAdd(inviteInIndexKey(invite.roomId, invite.toUserId), invite.inviteId)
    await this.redis.pubClient.sAdd(allInvitesKey(invite.roomId), invite.inviteId)
    this.scheduleInviteExpiry(invite)
  }

  async deleteInvite(invite: TradeInvite): Promise<void> {
    this.clearInviteExpiryTimer(invite.inviteId)
    await this.redis.pubClient.del(inviteKey(invite.roomId, invite.inviteId))
    await this.redis.pubClient.sRem(
      inviteOutIndexKey(invite.roomId, invite.fromUserId),
      invite.inviteId,
    )
    await this.redis.pubClient.sRem(inviteInIndexKey(invite.roomId, invite.toUserId), invite.inviteId)
    await this.redis.pubClient.sRem(allInvitesKey(invite.roomId), invite.inviteId)
  }

  /** Delete Redis row only. Caller / `onExpired` owns domain events. */
  async expireInvite(invite: TradeInvite): Promise<void> {
    await this.deleteInvite(invite)
  }

  async cancelInvitesForUser(roomId: string, userId: string): Promise<TradeInvite[]> {
    const outgoing = await this.listOutgoingInvites(roomId, userId)
    const incoming = await this.listIncomingInvites(roomId, userId)
    const removed: TradeInvite[] = []
    for (const invite of [...outgoing, ...incoming]) {
      await this.deleteInvite(invite)
      removed.push(invite)
    }
    return removed
  }

  async cancelInvitesForRoom(
    roomId: string,
    _reason: InviteCancelReason = "session_end",
  ): Promise<TradeInvite[]> {
    const ids = await this.redis.pubClient.sMembers(allInvitesKey(roomId))
    const cancelled: TradeInvite[] = []
    for (const inviteId of ids) {
      const invite = await this.getInvite(roomId, inviteId)
      if (!invite) {
        await this.redis.pubClient.sRem(allInvitesKey(roomId), inviteId)
        continue
      }
      await this.deleteInvite(invite)
      cancelled.push(invite)
    }
    return cancelled
  }

  private async listInvitesByIndex(roomId: string, indexKey: string): Promise<TradeInvite[]> {
    const invites = await hydrateIndexedJson<TradeInvite>({
      redis: this.redis,
      indexKey,
      allSetKey: allInvitesKey(roomId),
      recordKey: (id) => inviteKey(roomId, id),
      onRecord: async (invite) => {
        if (isInviteExpired(invite, PLAYER_TRANSFER_TTL_MS)) {
          await this.expireInvite(invite)
          await this.onExpired(invite)
          return "drop"
        }
        return "keep"
      },
    })
    return invites.sort((a, b) => a.createdAt - b.createdAt)
  }

  private scheduleInviteExpiry(invite: TradeInvite): void {
    this.clearInviteExpiryTimer(invite.inviteId)
    const remaining = invite.createdAt + PLAYER_TRANSFER_TTL_MS - Date.now()
    const delay = Math.max(0, remaining)
    const timer = setTimeout(() => {
      void this.expireInvite(invite).then(() => this.onExpired(invite))
    }, delay)
    this.inviteExpiryTimers.set(invite.inviteId, timer)
  }

  private clearInviteExpiryTimer(inviteId: string): void {
    const timer = this.inviteExpiryTimers.get(inviteId)
    if (timer) {
      clearTimeout(timer)
      this.inviteExpiryTimers.delete(inviteId)
    }
  }
}
