import type { PoolCardView } from "@repo/types"

/** Kickstarter campaign constants and types (ADR 0188; escrow on `EscrowPoolHelper`, ADR 0204). */

export const KICKSTARTER_STORAGE_KEY = "kickstarter:campaign"
/** Escrow pool for the funding phase; its id is the campaign id. */
export const KICKSTARTER_POOL_KEY = "kickstarter:pool"
/** `addScore` reason prefix for pledges and refunds (`kickstarter:pledge`, `kickstarter:refund`). */
export const KICKSTARTER_COIN_REASON = "kickstarter"

export const FUNDING_DURATION_MS = 5 * 60_000
export const DELIVERY_DELAY_MS = 5 * 60_000
export const POLL_DURATION_MS = 3 * 60_000
export const FROZEN_ASSETS_DURATION_MS = 15 * 60_000
/** How long to retry opening the delivery poll when another poll is active. */
export const POLL_BUSY_RETRY_WINDOW_MS = 60_000
export const POLL_BUSY_RETRY_INTERVAL_MS = 5_000
export const TIMER_FUNDING = "kickstarter:funding"
export const TIMER_DELIVERY_DELAY = "kickstarter:delivery-delay"
export const TIMER_POLL_RETRY = "kickstarter:poll-retry"

export type KickstarterPhase = "funding" | "deliveryWait" | "poll"

/** Campaign metadata. Pledges live in the escrow pool at `KICKSTARTER_POOL_KEY`. */
export type KickstarterCampaign = {
  id: string
  ownerUserId: string
  ownerName: string
  title: string
  rewards: string
  goal: number
  /** Paid out to the owner; set when funding succeeds (the pool holds the live total before then). */
  pledged: number
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

/** Room-visible campaign slice; `pledged` is the live pool total during funding. */
export type KickstarterPublicCampaign = KickstarterCampaign

/** Public slice merged into the plugin component store. No per-backer rows (ADR 0188). */
export type KickstarterPublicState = {
  campaignActive: boolean
  campaign: KickstarterPublicCampaign | null
  /** What the shared `pool-card` renders. */
  campaignPool: PoolCardView | null
}
