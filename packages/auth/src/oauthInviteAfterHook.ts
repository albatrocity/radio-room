import { createHash } from "node:crypto"
import { createAuthMiddleware } from "better-auth/api"
import { and, eq, isNull } from "drizzle-orm"

import { db, user as userTable, invitation } from "@repo/db"

const INVITE_COOKIE_NAME = "ba-invite-code"
/** OAuth round-trip can be slow; avoid matching long-established accounts that happen to have a stale invite cookie. */
const MAX_USER_AGE_MS_FOR_INVITE_MS = 5 * 60_000

function hashInviteCode(code: string): string {
  return createHash("sha256").update(code).digest("hex")
}

function parseInviteCodeFromCookie(cookieHeader: string | null | undefined, cookieName: string): string | undefined {
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

function isInvitationRowValid(inv: {
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

type SessionUser = { id: string; email: string; createdAt: Date | string }

/**
 * The invite-only plugin's after-hook expects `returned.user` or `newUser`, but the OAuth
 * callback completes with a redirect response, so those are unset. Better Auth does set
 * `context.newSession` in `setSessionCookie` before redirect — use that to consume the invite.
 */
export function oauthCallbackInviteAfterHook(cookieName: string = INVITE_COOKIE_NAME) {
  return createAuthMiddleware(async (ctx) => {
    const path = ctx.path ?? ""
    if (!path.startsWith("/callback/")) return

    const sessionUser = ctx.context.newSession?.user as SessionUser | undefined
    if (!sessionUser?.id || !sessionUser.email) return

    const created = new Date(sessionUser.createdAt)
    if (Number.isNaN(created.getTime()) || Date.now() - created.getTime() > MAX_USER_AGE_MS_FOR_INVITE_MS) {
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

    if (inv.email) {
      if (inv.email.toLowerCase() !== sessionUser.email.toLowerCase()) return
    }

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
