import type { LucideIconName } from "./LucideIconKey"

/**
 * Core presented-identity grant (ADR 0150).
 * Masks action attribution only — listener list always shows the true username.
 */
export type PresentedIdentityGrant = {
  userId: string
  /** Public label baked into action attribution (e.g. `"Somebody"`). */
  label: string
  /**
   * Label for aboveChat chrome / SegmentGroup (e.g. `"Disguise"`).
   * Falls back to {@link label} when omitted.
   */
  chromeLabel?: string
  /** Optional Lucide icon for aboveChat chrome (not baked into action text). */
  icon?: LucideIconName
  /**
   * When `toggleable` is true, whether the label is currently applied.
   * When `toggleable` is false, treat as always engaged while the grant lasts.
   */
  engaged: boolean
  /** If false, the subject cannot toggle; aboveChat shows a read-only label. */
  toggleable: boolean
  /** Unix epoch ms when the grant expires. */
  expiresAt: number
  /** Provenance (e.g. `item-shops:disguise`). */
  source: string
  /**
   * Timed modifier this grant is bound to, when one drives its window.
   * Core clears the grant when that modifier is removed or expires, so no
   * core code needs to know which plugin item created it (ADR 0150).
   */
  modifierId?: string
  /** Active game session id when granted. */
  sessionId: string
}

export type PresentedIdentityResolveResult = {
  label: string
  userId: string
  masked: boolean
}

/**
 * Input accepted by `grantPresentedIdentity` (operation and plugin API).
 * The plugin-facing surface makes `source` optional and defaults it to the
 * plugin name; everything else is shared so the two cannot drift.
 */
export type PresentedIdentityGrantInput = {
  userId: string
  label: string
  /** aboveChat label; defaults to `label` when omitted. */
  chromeLabel?: string
  /** Optional Lucide icon for aboveChat chrome. */
  icon?: LucideIconName
  toggleable: boolean
  /** Defaults to true when omitted. Forced true when `toggleable` is false. */
  engaged?: boolean
  durationMs: number
  source: string
  /** Timed modifier that owns this grant's window (see {@link PresentedIdentityGrant.modifierId}). */
  modifierId?: string
}
