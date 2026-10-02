import type { GameSessionPluginAPI, PluginContext } from "@repo/types"
import type { EscrowPledge, EscrowPoolState } from "@repo/plugin-base"
import {
  campaignPool,
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
  KICKSTARTER_POOL_KEY,
  POLL_DURATION_MS,
  type KickstarterCampaign,
  type KickstarterPublicState,
} from "./types"

export type KickstarterLifecycleDeps = {
  context: PluginContext
  game: GameSessionPluginAPI
}

function pool(deps: KickstarterLifecycleDeps) {
  return campaignPool({ storage: deps.context.storage, game: deps.game })
}

/** Campaign plus its escrow, as the room sees it. */
export async function loadPublicState(
  deps: KickstarterLifecycleDeps,
): Promise<KickstarterPublicState> {
  const campaign = await loadCampaign(deps.context)
  return toPublicState(campaign, campaign ? await pool(deps).read() : null)
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
    id: crypto.randomUUID(),
    ownerUserId: params.ownerUserId,
    ownerName: params.ownerName,
    title,
    rewards,
    goal,
    pledged: 0,
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
  // A pool left open by a campaign that never settled is refunded before reuse.
  // One that was already settled (closed) is not: its coins were paid out.
  const escrow = pool(deps)
  const stale = await escrow.read()
  if (stale) await escrow.refundAll({ poolId: stale.id })
  const opened = await escrow.open({
    id: campaign.id,
    title,
    goal,
    closesAt: campaign.phaseEndsAt,
  })
  if (!opened.ok) {
    await clearCampaign(deps.context)
    return { ok: false, message: "Could not open the campaign — please try again." }
  }
  return { ok: true, campaign, publicState: toPublicState(campaign, opened.pool) }
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
  const campaign = await loadCampaign(deps.context)
  if (!campaign || campaign.phase !== "funding") {
    return { ok: false, message: "No funding campaign is open." }
  }
  const result = await pool(deps).pledge(params.userId, amount, {
    username: params.username,
    poolId: campaign.id,
  })
  if (!result.ok) {
    return {
      ok: false,
      message:
        result.message === "Nothing is open to pledge to."
          ? "No funding campaign is open."
          : result.message,
    }
  }
  return {
    ok: true,
    campaign: { ...campaign, pledged: result.pool.raised },
    publicState: toPublicState(campaign, result.pool),
    goalMet: result.goalMet,
  }
}

export async function refundAll(
  deps: KickstarterLifecycleDeps,
): Promise<{ refunded: number; blocked: string[] }> {
  return pool(deps).refundAll()
}

/**
 * Close the escrow and pay the owner what it raised. Returns null when the
 * pool was already closed (goal met and deadline racing), so only one caller pays.
 */
export async function settleFundingSuccess(
  deps: KickstarterLifecycleDeps,
  campaign: KickstarterCampaign,
): Promise<{ campaign: KickstarterCampaign; publicState: KickstarterPublicState } | null> {
  const escrow = pool(deps)
  const closed = await escrow.close("funded", { poolId: campaign.id })
  if (!closed) return null
  const total = closed.raised
  if (total > 0) {
    await deps.game.addScore(campaign.ownerUserId, "coin", total, "kickstarter:payout", {
      intent: "exact",
    })
  }
  await escrow.clear(campaign.id)

  const next: KickstarterCampaign = {
    ...campaign,
    phase: "deliveryWait",
    phaseStartedAt: Date.now(),
    phaseEndsAt: Date.now() + DELIVERY_DELAY_MS,
    pledged: total,
  }
  await saveCampaign(deps.context, next)
  return { campaign: next, publicState: toPublicState(next) }
}

export async function settleFundingFailure(
  deps: KickstarterLifecycleDeps,
): Promise<{ refunded: number; blocked: string[] }> {
  const result = await refundAll(deps)
  await clearCampaign(deps.context)
  return result
}

/** Live pool total for a funding campaign (0 when the pool is gone). */
export async function poolRaised(
  deps: KickstarterLifecycleDeps,
  campaign: KickstarterCampaign,
): Promise<number> {
  const current = await pool(deps).read()
  return current?.id === campaign.id ? current.raised : 0
}

type LegacyCampaign = KickstarterCampaign & {
  pledges?: { id: string; userId: string; username?: string; amount: number }[]
}

/**
 * Campaigns started before the escrow moved to `EscrowPoolHelper` kept their
 * pledges inline. Move them into the pool once, so a deploy mid-campaign
 * neither loses nor double-counts escrowed coin.
 */
export async function adoptLegacyPledges(deps: KickstarterLifecycleDeps): Promise<void> {
  const campaign = (await loadCampaign(deps.context)) as LegacyCampaign | null
  if (!campaign?.pledges) return
  const { pledges, ...rest } = campaign
  if (campaign.phase === "funding" && !(await pool(deps).read())) {
    const escrow: EscrowPoolState = {
      id: campaign.id,
      title: campaign.title,
      goal: campaign.goal,
      openedAt: campaign.phaseStartedAt,
      closesAt: campaign.phaseEndsAt,
      status: "open",
      raised: pledges.reduce((sum, p) => sum + p.amount, 0),
      pledges: pledges.map((p): EscrowPledge => ({ ...p, at: campaign.phaseStartedAt })),
    }
    await deps.context.storage.setJson(KICKSTARTER_POOL_KEY, escrow)
  }
  await saveCampaign(deps.context, {
    ...rest,
    pledged: campaign.phase === "funding" ? 0 : rest.pledged,
  })
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
  await pool(deps).clear()
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

export { loadCampaign, loadCampaignRaw, toPublicState }
