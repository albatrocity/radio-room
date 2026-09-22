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
  const raw = await context.storage.get(KICKSTARTER_STORAGE_KEY)
  if (!raw || typeof raw !== "string") {
    return { raw: null, campaign: null }
  }
  try {
    return { raw, campaign: JSON.parse(raw) as KickstarterCampaign }
  } catch {
    return { raw: null, campaign: null }
  }
}

export async function loadCampaign(
  context: PluginContext,
): Promise<KickstarterCampaign | null> {
  const { campaign } = await loadCampaignRaw(context)
  return campaign
}

export async function saveCampaign(
  context: PluginContext,
  campaign: KickstarterCampaign,
): Promise<void> {
  await context.storage.set(KICKSTARTER_STORAGE_KEY, JSON.stringify(campaign))
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
