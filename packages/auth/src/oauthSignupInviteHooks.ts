import { createHash } from "node:crypto"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { and, eq, isNull } from "drizzle-orm"

import { db, user as userTable, invitation } from "@repo/db"

export const INVITE_COOKIE_NAME = "ba-invite-code"

/** Context merge key: OAuth callback passed invite gate for explicit signup (`requestSignUp`). */
export const OAUTH_INVITE_SIGNUP_OK = "listeningRoomOAuthInviteSignupOk" as const

/**
 * OAuth user creation can lag wall clock; keep generous window for after-hook consumption.
 */
const MAX_USER_AGE_MS_FOR_INVITE_CONSUME_MS = 10 * 60_000

export function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}

export function parseInviteCodeFromCookie(
  cookieHeader: string | null | undefined,
  cookieName: string,
): string | undefined {
  if (!cookieHeader) return undefined
  const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const re = new RegExp(`(?:^|;\\s*)${escaped}=([^;]+)`)
  const match = cookieHeader.match(re)
  const raw = match?.[1]?.trim()
  if (!raw) return undefined
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function isInvitationRowValid(inv: {
  revokedAt: Date | null
  maxUses: number
  useCount: number
  usedAt: Date | null
  expiresAt: Date
}): boolean {
  if (inv.revokedAt) return false
  if ((inv.maxUses ?? 1) > 1) {
    if ((inv.useCount ?? 0) >= inv.maxUses) return false
  } else if (inv.usedAt) return false
  const expiresMs = new Date(inv.expiresAt).getTime()
  if (Number.isNaN(expiresMs) || expiresMs < Date.now()) return false
  return true
}

function getQueryParam(query: unknown, key: string): string | undefined {
  if (!query || typeof query !== "object") return undefined
  const v = (query as Record<string, unknown>)[key]
  if (typeof v === "string") return v
  if (Array.isArray(v) && typeof v[0] === "string") return v[0]
  return undefined
}

type OAuthStatePayload = {
  requestSignUp?: boolean
  expiresAt?: number
}

function parseOAuthStatePayload(raw: string): OAuthStatePayload | null {
  try {
    return JSON.parse(raw) as OAuthStatePayload
  } catch {
    return null
  }
}

type SessionUser = { id: string; email: string; createdAt: Date | string }

/**
 * Before the OAuth callback handler runs: read OAuth state from the verification table without
 * deleting it (parseState in the handler consumes it). Require a valid pending invitation when
 * `requestSignUp` is true so new accounts cannot be created without an invite.
 */
export function oauthSignupInviteBeforeHook(cookieName: string = INVITE_COOKIE_NAME) {
  return createAuthMiddleware(async (ctx) => {
    if (process.env.SEED_MODE === "true") return

    const path = ctx.path ?? ""
    if (!path.startsWith("/callback/")) return
    if (ctx.method !== "GET") return

    const state = getQueryParam(ctx.query, "state")
    if (!state) return

    const record = await ctx.context.internalAdapter.findVerificationValue(state)
    if (!record?.value) return

    const data = parseOAuthStatePayload(record.value)
    if (!data) return

    if (typeof data.expiresAt === "number" && data.expiresAt < Date.now()) {
      throw APIError.from("FORBIDDEN", { message: "OAuth state expired", code: "STATE_EXPIRED" })
    }

    if (!data.requestSignUp) return

    const cookieHeader = ctx.headers?.get?.("cookie") ?? ""
    const inviteCode = parseInviteCodeFromCookie(cookieHeader, cookieName)
    if (!inviteCode) {
      throw APIError.from("FORBIDDEN", { message: "Invitation code required", code: "INVITE_REQUIRED" })
    }

    const codeHash = hashInviteCode(inviteCode)
    const [inv] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.codeHash, codeHash))
      .limit(1)

    if (!inv || !isInvitationRowValid(inv)) {
      throw APIError.from("FORBIDDEN", { message: "Invalid or expired invitation", code: "INVALID_INVITE" })
    }

    return {
      context: {
        [OAUTH_INVITE_SIGNUP_OK]: true as const,
      },
    }
  })
}

/**
 * After session cookie is set on OAuth callback: consume invitation and promote to admin for
 * brand-new users that passed the before-hook (explicit signup + invite). Login callbacks skip
 * because `listeningRoomOAuthInviteSignupOk` is unset.
 */
export function oauthSignupInviteAfterHook(cookieName: string = INVITE_COOKIE_NAME) {
  return createAuthMiddleware(async (ctx) => {
    if (process.env.SEED_MODE === "true") return

    const path = ctx.path ?? ""
    if (!path.startsWith("/callback/")) return

    const ctxWithFlag = ctx as typeof ctx & { [OAUTH_INVITE_SIGNUP_OK]?: boolean }
    if (!ctxWithFlag[OAUTH_INVITE_SIGNUP_OK]) return

    const sessionUser = ctx.context.newSession?.user as SessionUser | undefined
    if (!sessionUser?.id || !sessionUser.email) return

    const created = new Date(sessionUser.createdAt)
    if (
      Number.isNaN(created.getTime()) ||
      Date.now() - created.getTime() > MAX_USER_AGE_MS_FOR_INVITE_CONSUME_MS
    ) {
      return
    }

    const inviteCode = parseInviteCodeFromCookie(ctx.headers?.get?.("cookie") ?? "", cookieName)
    if (!inviteCode) return

    const codeHash = hashInviteCode(inviteCode)
    const [inv] = await db
      .select()
      .from(invitation)
      .where(eq(invitation.codeHash, codeHash))
      .limit(1)

    if (!inv || !isInvitationRowValid(inv)) return

    if (inv.email && inv.email.toLowerCase() !== sessionUser.email.toLowerCase()) return

    const isMultiUse = (inv.maxUses ?? 1) > 1
    const now = new Date()

    await db.transaction(async (tx) => {
      if (isMultiUse) {
        const newUseCount = (inv.useCount ?? 0) + 1
        const hitMax = newUseCount >= inv.maxUses
        const [row] = await tx
          .update(invitation)
          .set({
            useCount: newUseCount,
            ...(hitMax ? { usedAt: now, usedBy: sessionUser.id } : {}),
          })
          .where(and(eq(invitation.id, inv.id), eq(invitation.useCount, inv.useCount ?? 0)))
          .returning({ id: invitation.id })

        if (!row) return
        await tx
          .update(userTable)
          .set({ role: "admin", updatedAt: now })
          .where(eq(userTable.id, sessionUser.id))
        return
      }

      const [row] = await tx
        .update(invitation)
        .set({
          usedBy: sessionUser.id,
          usedAt: now,
          useCount: 1,
        })
        .where(and(eq(invitation.id, inv.id), isNull(invitation.usedAt)))
        .returning({ id: invitation.id })

      if (!row) {
        const [existing] = await tx
          .select({ usedBy: invitation.usedBy })
          .from(invitation)
          .where(eq(invitation.id, inv.id))
          .limit(1)
        if (existing?.usedBy === sessionUser.id) {
          await tx
            .update(userTable)
            .set({ role: "admin", updatedAt: now })
            .where(eq(userTable.id, sessionUser.id))
        }
        return
      }

      await tx
        .update(userTable)
        .set({ role: "admin", updatedAt: now })
        .where(eq(userTable.id, sessionUser.id))
    })
  })
}
