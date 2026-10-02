import type { PluginContext } from "@repo/types"
import { EscrowPoolHelper, type EscrowPoolState } from "@repo/plugin-base"
import {
  KICKSTARTER_COIN_REASON,
  KICKSTARTER_POOL_KEY,
  KICKSTARTER_STORAGE_KEY,
  type KickstarterCampaign,
  type KickstarterPublicState,
} from "./types"

export async function loadCampaignRaw(
  context: PluginContext,
): Promise<{ raw: string | null; campaign: KickstarterCampaign | null }> {
  return context.storage.getJson<KickstarterCampaign>(KICKSTARTER_STORAGE_KEY)
    .then(({ raw, value }) => ({ raw, campaign: value }))
}

export async function loadCampaign(
  context: PluginContext,
): Promise<KickstarterCampaign | null> {
  const { value } = await context.storage.getJson<KickstarterCampaign>(KICKSTARTER_STORAGE_KEY)
  return value
}

export async function saveCampaign(
  context: PluginContext,
  campaign: KickstarterCampaign,
): Promise<void> {
  await context.storage.setJson(KICKSTARTER_STORAGE_KEY, campaign)
}

/**
 * Persist campaign only if Redis still holds `expectedRaw` (null = key absent).
 * Used for the concurrent start race (ADR 0188 CAS).
 */
export async function saveCampaignCas(
  context: PluginContext,
  expectedRaw: string | null,
  campaign: KickstarterCampaign,
): Promise<boolean> {
  return context.storage.compareAndSet(
    KICKSTARTER_STORAGE_KEY,
    expectedRaw,
    JSON.stringify(campaign),
  )
}

/**
 * Atomic read-modify-write for campaign state (ADR 0192 reference example).
 * Replaces the manual loadCampaignRaw + saveCampaignCas retry pattern.
 */
export async function updateCampaign(
  context: PluginContext,
  fn: (prev: KickstarterCampaign | null) => KickstarterCampaign,
  options?: { retries?: number },
): Promise<KickstarterCampaign> {
  return context.storage.updateJson<KickstarterCampaign>(
    KICKSTARTER_STORAGE_KEY,
    fn,
    options,
  )
}

export async function clearCampaign(context: PluginContext): Promise<void> {
  await context.storage.del(KICKSTARTER_STORAGE_KEY)
}

/** The funding-phase escrow (ADR 0204). */
export function campaignPool(
  deps: ConstructorParameters<typeof EscrowPoolHelper>[0],
): EscrowPoolHelper {
  const context = deps
  return new EscrowPoolHelper(context, {
    key: KICKSTARTER_POOL_KEY,
    reason: KICKSTARTER_COIN_REASON,
  })
}

const PHASE_LABEL: Record<KickstarterCampaign["phase"], string> = {
  funding: "Funding",
  deliveryWait: "Awaiting delivery",
  poll: "Delivery review",
}

/** Live total: the pool while funding, the paid-out amount afterwards. */
function raisedFor(campaign: KickstarterCampaign, pool: EscrowPoolState | null): number {
  return campaign.phase === "funding" && pool?.id === campaign.id ? pool.raised : campaign.pledged
}

export function toPublicState(
  campaign: KickstarterCampaign | null,
  pool: EscrowPoolState | null = null,
): KickstarterPublicState {
  if (!campaign) return { campaignActive: false, campaign: null, campaignPool: null }
  const raised = raisedFor(campaign, pool)
  return {
    campaignActive: true,
    campaign: { ...campaign, pledged: raised },
    campaignPool: {
      id: campaign.id,
      title: campaign.title,
      icon: "🚀",
      eyebrow: `Crowdfunding · ${PHASE_LABEL[campaign.phase]}`,
      subtitle: `by ${campaign.ownerName}`,
      bodyLabel: "Rewards",
      body: campaign.rewards,
      goal: campaign.goal,
      raised,
      startedAt: campaign.phaseStartedAt,
      endsAt: campaign.phaseEndsAt,
      open: campaign.phase === "funding",
    },
  }
}
