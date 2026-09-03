import type {
  PresentedIdentityGrant,
  PresentedIdentityResolveResult,
} from "@repo/types"

/** Default public label for anonymous / disguised action attribution. */
export const PRESENTED_IDENTITY_ANONYMOUS_LABEL = "Somebody"

export function isPresentedIdentityGrantActive(
  grant: PresentedIdentityGrant | null | undefined,
  now: number = Date.now(),
): grant is PresentedIdentityGrant {
  return Boolean(grant && grant.expiresAt > now)
}

/** Whether the grant currently masks action attribution. */
export function isPresentedIdentityMasked(
  grant: PresentedIdentityGrant | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!isPresentedIdentityGrantActive(grant, now)) return false
  return !grant.toggleable || grant.engaged
}

/** aboveChat SegmentGroup / read-only label (falls back to attribution label). */
export function presentedIdentityChromeLabel(grant: PresentedIdentityGrant): string {
  const chrome = grant.chromeLabel?.trim()
  return chrome || grant.label.trim() || PRESENTED_IDENTITY_ANONYMOUS_LABEL
}

/**
 * Resolve the display label for action attribution.
 * Listener list must not use this — always show the true username there.
 */
export function resolvePresentedIdentity(params: {
  userId: string
  trueUsername: string
  grant: PresentedIdentityGrant | null | undefined
  now?: number
}): PresentedIdentityResolveResult {
  const { userId, trueUsername, grant, now = Date.now() } = params
  const trimmed = trueUsername.trim() || userId
  if (isPresentedIdentityMasked(grant, now) && grant) {
    return {
      label: grant.label.trim() || PRESENTED_IDENTITY_ANONYMOUS_LABEL,
      userId,
      masked: true,
    }
  }
  return { label: trimmed, userId, masked: false }
}
