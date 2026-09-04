import type { TradeInvite, TradeParticipantState, TradeSession } from "@repo/types"

export function tradeKey(roomId: string, tradeId: string): string {
  return `room:${roomId}:trade:${tradeId}`
}
export function byUserKey(roomId: string, userId: string): string {
  return `room:${roomId}:trade:byUser:${userId}`
}
export function inviteKey(roomId: string, inviteId: string): string {
  return `room:${roomId}:tradeInvite:${inviteId}`
}
export function inviteInIndexKey(roomId: string, userId: string): string {
  return `room:${roomId}:tradeInvites:in:${userId}`
}
export function inviteOutIndexKey(roomId: string, userId: string): string {
  return `room:${roomId}:tradeInvites:out:${userId}`
}
export function allInvitesKey(roomId: string): string {
  return `room:${roomId}:tradeInvites:all`
}
export function openTradesKey(roomId: string): string {
  return `room:${roomId}:trades:open`
}

export function emptyParticipant(userId: string): TradeParticipantState {
  return {
    userId,
    draft: [],
    offer: [],
    locked: false,
    confirmed: false,
  }
}

export function isInviteExpired(invite: TradeInvite, ttlMs: number, now = Date.now()): boolean {
  return now - invite.createdAt > ttlMs
}

export type { TradeSession }
