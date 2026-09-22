import type { PluginContext } from "@repo/types"
import {
  KICKSTARTER_STORAGE_KEY,
  type KickstarterCampaign,
  type KickstarterPublicCampaign,
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
 * Used for concurrent pledge / start races (ADR 0188 CAS).
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

function toPublicCampaign(campaign: KickstarterCampaign): KickstarterPublicCampaign {
  const { pledges: _pledges, ...publicCampaign } = campaign
  return publicCampaign
}

export function toPublicState(campaign: KickstarterCampaign | null): KickstarterPublicState {
  return {
    campaignActive: campaign != null,
    campaign: campaign ? toPublicCampaign(campaign) : null,
  }
}
