/** Kickstarter campaign constants and types (ADR 0188). */

export const KICKSTARTER_STORAGE_KEY = "kickstarter:campaign"

export const FUNDING_DURATION_MS = 5 * 60_000
export const DELIVERY_DELAY_MS = 5 * 60_000
export const POLL_DURATION_MS = 3 * 60_000
export const FROZEN_ASSETS_DURATION_MS = 15 * 60_000
/** How long to retry opening the delivery poll when another poll is active. */
export const POLL_BUSY_RETRY_WINDOW_MS = 60_000
export const POLL_BUSY_RETRY_INTERVAL_MS = 5_000
/** Max CAS retries when concurrent pledges collide. */
export const PLEDGE_CAS_MAX_ATTEMPTS = 8

export const TIMER_FUNDING = "kickstarter:funding"
export const TIMER_DELIVERY_DELAY = "kickstarter:delivery-delay"
export const TIMER_POLL_RETRY = "kickstarter:poll-retry"

export type KickstarterPhase = "funding" | "deliveryWait" | "poll"

export type KickstarterPledge = {
  /** Stable row id for CAS compensate (debit-after-append). */
  id: string
  userId: string
  username: string
  amount: number
}

export type KickstarterCampaign = {
  id: string
  ownerUserId: string
  ownerName: string
  title: string
  rewards: string
  goal: number
  pledged: number
  pledges: KickstarterPledge[]
  phase: KickstarterPhase
  /** Epoch ms when the current phase timer started (for ExpiryBar). */
  phaseStartedAt: number
  phaseEndsAt: number
  pollId: string | null
  /** optionId for "Yes" when a delivery poll is open. */
  pollYesOptionId: string | null
  /** optionId for "No" when a delivery poll is open. */
  pollNoOptionId: string | null
  /** When poll open was first attempted (for busy-retry window). */
  pollAttemptStartedAt: number | null
}

/** Room-visible campaign slice — no per-backer pledge rows. */
export type KickstarterPublicCampaign = Omit<KickstarterCampaign, "pledges">

/** Public slice merged into the plugin component store. */
export type KickstarterPublicState = {
  campaignActive: boolean
  campaign: KickstarterPublicCampaign | null
}
