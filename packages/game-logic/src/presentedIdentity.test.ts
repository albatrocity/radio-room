import { describe, expect, it } from "vitest"
import {
  PRESENTED_IDENTITY_ANONYMOUS_LABEL,
  isPresentedIdentityGrantActive,
  isPresentedIdentityMasked,
  presentedIdentityChromeLabel,
  resolvePresentedIdentity,
} from "./presentedIdentity"
import type { PresentedIdentityGrant } from "@repo/types"

function grant(overrides?: Partial<PresentedIdentityGrant>): PresentedIdentityGrant {
  const now = Date.now()
  return {
    userId: "u1",
    label: PRESENTED_IDENTITY_ANONYMOUS_LABEL,
    engaged: true,
    toggleable: true,
    expiresAt: now + 60_000,
    source: "item-shops:disguise",
    sessionId: "s1",
    ...overrides,
  }
}

describe("resolvePresentedIdentity", () => {
  it("uses true username when no grant", () => {
    expect(
      resolvePresentedIdentity({
        userId: "u1",
        trueUsername: "Alice",
        grant: null,
      }),
    ).toEqual({ label: "Alice", userId: "u1", masked: false })
  })

  it("masks when toggleable and engaged", () => {
    expect(
      resolvePresentedIdentity({
        userId: "u1",
        trueUsername: "Alice",
        grant: grant({ engaged: true, toggleable: true }),
      }),
    ).toEqual({ label: "Somebody", userId: "u1", masked: true })
  })

  it("does not mask when toggleable and disengaged", () => {
    expect(
      resolvePresentedIdentity({
        userId: "u1",
        trueUsername: "Alice",
        grant: grant({ engaged: false, toggleable: true }),
      }),
    ).toEqual({ label: "Alice", userId: "u1", masked: false })
  })

  it("always masks when not toggleable", () => {
    expect(
      resolvePresentedIdentity({
        userId: "u1",
        trueUsername: "Alice",
        grant: grant({ engaged: false, toggleable: false }),
      }),
    ).toEqual({ label: "Somebody", userId: "u1", masked: true })
  })

  it("treats expired grants as inactive", () => {
    const expired = grant({ expiresAt: Date.now() - 1000 })
    expect(isPresentedIdentityGrantActive(expired)).toBe(false)
    expect(isPresentedIdentityMasked(expired)).toBe(false)
  })

  it("uses chromeLabel for UI when present", () => {
    expect(presentedIdentityChromeLabel(grant({ chromeLabel: "Disguise" }))).toBe("Disguise")
  })
})
