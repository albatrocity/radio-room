/**
 * Presented display name for action attribution (ADR 0149 / 0150).
 * Listener list should use the true username directly — do not pass a mask there.
 * When chat/queue bake a presented label into `username` / `addedBy.username`,
 * pass that as `maskedUsername` and the live true name as `trueUsername`.
 */
export function wasPresentedIdentityMasked(params: {
  trueUsername: string
  maskedUsername?: string | null
}): boolean {
  const { trueUsername, maskedUsername } = params
  if (maskedUsername == null || maskedUsername === "") return false
  return maskedUsername !== trueUsername
}

export function showXRayPierceIcon(params: {
  trueUsername: string
  viewerPierces?: boolean
  maskedUsername?: string | null
}): boolean {
  const { trueUsername, viewerPierces = false, maskedUsername } = params
  return viewerPierces && wasPresentedIdentityMasked({ trueUsername, maskedUsername })
}

export function presentedUsername(params: {
  trueUsername: string
  /** When true, the viewer has `inventory_peek` and should see the real name. */
  viewerPierces?: boolean
  /** Baked / presented label when the subject was masked at emit time. */
  maskedUsername?: string | null
}): string {
  const { trueUsername, viewerPierces = false, maskedUsername } = params
  if (viewerPierces || maskedUsername == null || maskedUsername === "") {
    return trueUsername
  }
  return maskedUsername
}
