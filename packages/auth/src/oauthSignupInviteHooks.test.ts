import { describe, test, expect, vi, beforeEach } from "vitest"
import { APIError } from "better-auth/api"

const mockLimit = vi.hoisted(() => vi.fn())

vi.mock("@repo/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        where: () => ({
          limit: mockLimit,
        }),
      }),
    })),
  },
  invitation: {},
  user: {},
}))

import {
  hashInviteCode,
  parseInviteCodeFromCookie,
  isInvitationRowValid,
  oauthSignupInviteBeforeHook,
  OAUTH_INVITE_SIGNUP_OK,
} from "./oauthSignupInviteHooks"

describe("oauth invite helpers", () => {
  test("hashInviteCode is stable SHA-256 hex", () => {
    expect(hashInviteCode("abc")).toBe(hashInviteCode("abc"))
    expect(hashInviteCode("abc")).not.toBe(hashInviteCode("abd"))
    expect(hashInviteCode("abc")).toMatch(/^[a-f0-9]{64}$/)
  })

  test("parseInviteCodeFromCookie extracts value", () => {
    expect(parseInviteCodeFromCookie("ba-invite-code=hello%3D", "ba-invite-code")).toBe("hello=")
    expect(parseInviteCodeFromCookie("other=1; ba-invite-code=xyz", "ba-invite-code")).toBe("xyz")
    expect(parseInviteCodeFromCookie(undefined, "ba-invite-code")).toBeUndefined()
  })

  test("isInvitationRowValid rejects used single-use invites", () => {
    const base = {
      revokedAt: null,
      maxUses: 1,
      useCount: 0,
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    }
    expect(isInvitationRowValid(base)).toBe(true)
    expect(isInvitationRowValid({ ...base, usedAt: new Date() })).toBe(false)
    expect(isInvitationRowValid({ ...base, revokedAt: new Date() })).toBe(false)
    expect(isInvitationRowValid({ ...base, expiresAt: new Date(Date.now() - 60_000) })).toBe(false)
  })
})

describe("oauthSignupInviteBeforeHook", () => {
  const hook = oauthSignupInviteBeforeHook()

  beforeEach(() => {
    vi.stubEnv("SEED_MODE", "false")
    mockLimit.mockReset()
  })

  test("returns early when not OAuth callback path", async () => {
    const ctx = {
      path: "/sign-in/email",
      method: "GET",
      query: { state: "s1" },
      headers: new Headers(),
      context: { internalAdapter: { findVerificationValue: vi.fn() } },
    }
    const result = await hook(ctx as any)
    expect(result).toBeUndefined()
  })

  test("returns early when OAuth state has no requestSignUp", async () => {
    const findVerificationValue = vi.fn().mockResolvedValue({
      value: JSON.stringify({
        requestSignUp: false,
        expiresAt: Date.now() + 60_000,
      }),
    })
    const ctx = {
      path: "/callback/google",
      method: "GET",
      query: { state: "st" },
      headers: new Headers(),
      context: { internalAdapter: { findVerificationValue } },
    }
    const result = await hook(ctx as any)
    expect(result).toBeUndefined()
  })

  test("throws when requestSignUp without invite cookie", async () => {
    const findVerificationValue = vi.fn().mockResolvedValue({
      value: JSON.stringify({
        requestSignUp: true,
        expiresAt: Date.now() + 60_000,
      }),
    })
    const ctx = {
      path: "/callback/google",
      method: "GET",
      query: { state: "st" },
      headers: new Headers(),
      context: { internalAdapter: { findVerificationValue } },
    }
    await expect(hook(ctx as any)).rejects.toThrow(APIError)
  })

  test("sets flag when requestSignUp and invite cookie matches pending invitation", async () => {
    const code = "invite-code-xyz"
    mockLimit.mockResolvedValue([
      {
        id: "inv1",
        email: null,
        codeHash: hashInviteCode(code),
        invitedBy: "admin1",
        maxUses: 1,
        useCount: 0,
        usedBy: null,
        usedAt: null,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        metadata: null,
      },
    ])

    const findVerificationValue = vi.fn().mockResolvedValue({
      value: JSON.stringify({
        requestSignUp: true,
        expiresAt: Date.now() + 60_000,
      }),
    })
    const headers = new Headers()
    headers.set("cookie", `ba-invite-code=${encodeURIComponent(code)}`)

    const ctx = {
      path: "/callback/google",
      method: "GET",
      query: { state: "st" },
      headers,
      context: { internalAdapter: { findVerificationValue } },
    }

    const result = (await hook(ctx as any)) as { context: Record<string, boolean> }
    expect(result?.context?.[OAUTH_INVITE_SIGNUP_OK]).toBe(true)
  })
})
