import type { GameSessionPluginAPI, PluginContext } from "@repo/types"
import { randomUUID } from "node:crypto"
import { hasActiveCoinLock } from "./coinLock"
import {
  clearCampaign,
  loadCampaign,
  loadCampaignRaw,
  saveCampaign,
  saveCampaignCas,
  toPublicState,
} from "./state"
import {
  DELIVERY_DELAY_MS,
  FROZEN_ASSETS_DURATION_MS,
  FUNDING_DURATION_MS,
  PLEDGE_CAS_MAX_ATTEMPTS,
  POLL_DURATION_MS,
  type KickstarterCampaign,
  type KickstarterPublicState,
} from "./types"

export type KickstarterLifecycleDeps = {
  context: PluginContext
  game: GameSessionPluginAPI
}

/** Delivery poll outcome: zero votes succeed; otherwise yes must be at least half. */
export function isDeliverySuccessful(yes: number, no: number): boolean {
  const total = yes + no
  return total === 0 || yes >= total / 2
}

export async function startCampaign(
  deps: KickstarterLifecycleDeps,
  params: {
    ownerUserId: string
    ownerName: string
    title: string
    rewards: string
    goal: number
  },
): Promise<
  | { ok: true; campaign: KickstarterCampaign; publicState: KickstarterPublicState }
  | { ok: false; message: string }
> {
  const session = await deps.game.getActiveSession()
  if (!session) {
    return { ok: false, message: "No active game session." }
  }

  const title = params.title.trim()
  const rewards = params.rewards.trim()
  const goal = Math.floor(params.goal)
  if (!title) return { ok: false, message: "Enter a campaign title." }
  if (!rewards) return { ok: false, message: "Describe the backer rewards." }
  if (!Number.isFinite(goal) || goal < 1) {
    return { ok: false, message: "Goal must be at least 1 coin." }
  }

  const { raw, campaign: existing } = await loadCampaignRaw(deps.context)
  if (existing) {
    return { ok: false, message: "A crowdfunding campaign is already running in this room." }
  }

  const now = Date.now()
  const campaign: KickstarterCampaign = {
    id: randomUUID(),
    ownerUserId: params.ownerUserId,
    ownerName: params.ownerName,
    title,
    rewards,
    goal,
    pledged: 0,
    pledges: [],
    phase: "funding",
    phaseStartedAt: now,
    phaseEndsAt: now + FUNDING_DURATION_MS,
    pollId: null,
    pollYesOptionId: null,
    pollNoOptionId: null,
    pollAttemptStartedAt: null,
  }

  const saved = await saveCampaignCas(deps.context, raw, campaign)
  if (!saved) {
    return { ok: false, message: "A crowdfunding campaign is already running in this room." }
  }
  return { ok: true, campaign, publicState: toPublicState(campaign) }
}

export async function pledge(
  deps: KickstarterLifecycleDeps,
  params: { userId: string; username: string; amount: number },
): Promise<
  | {
      ok: true
      campaign: KickstarterCampaign
      publicState: KickstarterPublicState
      goalMet: boolean
    }
  | { ok: false; message: string }
> {
  const amount = Math.floor(params.amount)
  if (!Number.isFinite(amount) || amount < 1) {
    return { ok: false, message: "Pledge at least 1 coin." }
  }

  for (let attempt = 0; attempt < PLEDGE_CAS_MAX_ATTEMPTS; attempt++) {
    const { raw, campaign } = await loadCampaignRaw(deps.context)
    if (!campaign || campaign.phase !== "funding") {
      return { ok: false, message: "No funding campaign is open." }
    }

    const state = await deps.game.getUserState(params.userId)
    if (hasActiveCoinLock(state)) {
      return { ok: false, message: "Your assets are frozen — you can't pledge right now." }
    }
    const balance = state?.attributes?.coin ?? 0
    if (balance < amount) {
      return { ok: false, message: "You don't have enough coin." }
    }

    const pledgeId = randomUUID()
    const next: KickstarterCampaign = {
      ...campaign,
      pledges: [
        ...campaign.pledges,
        {
          id: pledgeId,
          userId: params.userId,
          username: params.username,
          amount,
        },
      ],
      pledged: campaign.pledged + amount,
    }

    const saved = await saveCampaignCas(deps.context, raw, next)
    if (!saved) {
      // Contention — retry against latest snapshot without touching the ledger.
      continue
    }

    const before = balance
    const after = await deps.game.addScore(params.userId, "coin", -amount, "kickstarter:pledge", {
      intent: "exact",
    })
    // Lock / race: debit may silently no-op — roll the pledge back out of Redis.
    if (after === before || after > before - amount) {
      await removePledgeById(deps, pledgeId, amount)
      return { ok: false, message: "Could not deduct coin for this pledge." }
    }

    return {
      ok: true,
      campaign: next,
      publicState: toPublicState(next),
      goalMet: next.pledged >= next.goal,
    }
  }

  return { ok: false, message: "Could not record your pledge — please try again." }
}

/** Best-effort CAS remove after a debit failure so escrow cannot grow without coin. */
async function removePledgeById(
  deps: KickstarterLifecycleDeps,
  pledgeId: string,
  amount: number,
): Promise<void> {
  for (let attempt = 0; attempt < PLEDGE_CAS_MAX_ATTEMPTS; attempt++) {
    const { raw, campaign } = await loadCampaignRaw(deps.context)
    if (!campaign) return
    const idx = campaign.pledges.findIndex((p) => p.id === pledgeId)
    if (idx < 0) return
    const pledges = campaign.pledges.slice()
    pledges.splice(idx, 1)
    const next: KickstarterCampaign = {
      ...campaign,
      pledges,
      pledged: Math.max(0, campaign.pledged - amount),
    }
    if (await saveCampaignCas(deps.context, raw, next)) return
  }
}

export async function refundAll(
  deps: KickstarterLifecycleDeps,
  campaign: KickstarterCampaign,
): Promise<{ refunded: number; blocked: string[] }> {
  let refunded = 0
  const blocked: string[] = []
  for (const p of campaign.pledges) {
    const state = await deps.game.getUserState(p.userId)
    if (hasActiveCoinLock(state)) {
      blocked.push(p.userId)
      continue
    }
    await deps.game.addScore(p.userId, "coin", p.amount, "kickstarter:refund", {
      intent: "exact",
    })
    refunded += p.amount
  }
  return { refunded, blocked }
}

export async function settleFundingSuccess(
  deps: KickstarterLifecycleDeps,
  campaign: KickstarterCampaign,
): Promise<{ campaign: KickstarterCampaign; publicState: KickstarterPublicState }> {
  const total = campaign.pledged
  if (total > 0) {
    await deps.game.addScore(campaign.ownerUserId, "coin", total, "kickstarter:payout", {
      intent: "exact",
    })
  }

  const next: KickstarterCampaign = {
    ...campaign,
    phase: "deliveryWait",
    phaseStartedAt: Date.now(),
    phaseEndsAt: Date.now() + DELIVERY_DELAY_MS,
    pledges: [], // escrow cleared into owner balance
    pledged: total,
  }
  await saveCampaign(deps.context, next)
  return { campaign: next, publicState: toPublicState(next) }
}

export async function settleFundingFailure(
  deps: KickstarterLifecycleDeps,
  campaign: KickstarterCampaign,
): Promise<{ refunded: number; blocked: string[] }> {
  const result = await refundAll(deps, campaign)
  await clearCampaign(deps.context)
  return result
}

export async function applyFrozenAssets(
  deps: KickstarterLifecycleDeps,
  ownerUserId: string,
): Promise<void> {
  await deps.game.applyTimedModifier(ownerUserId, FROZEN_ASSETS_DURATION_MS, {
    name: "Frozen Assets",
    effects: [{ type: "lock", target: "coin", intent: "negative", icon: "Snowflake" }],
    stackBehavior: "replace",
  })
}

export async function finishCampaign(
  deps: KickstarterLifecycleDeps,
): Promise<KickstarterPublicState> {
  await clearCampaign(deps.context)
  return toPublicState(null)
}

export async function markPollOpen(
  deps: KickstarterLifecycleDeps,
  campaign: KickstarterCampaign,
  params: {
    pollId: string
    yesOptionId: string
    noOptionId: string
    /** Prefer the core poll's closesAt (ADR 0189). */
    closesAt?: number
  },
): Promise<{ campaign: KickstarterCampaign; publicState: KickstarterPublicState }> {
  const now = Date.now()
  const phaseEndsAt = params.closesAt ?? now + POLL_DURATION_MS
  const next: KickstarterCampaign = {
    ...campaign,
    phase: "poll",
    phaseStartedAt: now,
    phaseEndsAt,
    pollId: params.pollId,
    pollYesOptionId: params.yesOptionId,
    pollNoOptionId: params.noOptionId,
    pollAttemptStartedAt: campaign.pollAttemptStartedAt ?? now,
  }
  await saveCampaign(deps.context, next)
  return { campaign: next, publicState: toPublicState(next) }
}

export async function markPollAttempt(
  deps: KickstarterLifecycleDeps,
  campaign: KickstarterCampaign,
): Promise<KickstarterCampaign> {
  if (campaign.pollAttemptStartedAt != null) return campaign
  const next = { ...campaign, pollAttemptStartedAt: Date.now() }
  await saveCampaign(deps.context, next)
  return next
}

export { loadCampaign, toPublicState }
