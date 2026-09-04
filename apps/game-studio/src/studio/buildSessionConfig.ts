import type { GameAttributeName, GameSessionConfig } from "@repo/types"
import { DEFAULT_SLOT_CAPS } from "@repo/types"
import { newId } from "./id"

export const DEFAULT_PLAYBACK_SLOTS = DEFAULT_SLOT_CAPS.playback

/**
 * Mirrors `packages/server/services/GameSessionService.ts` defaults for sandbox sessions.
 */
export function buildSessionConfig(
  partial: Partial<GameSessionConfig> & { name: string },
): GameSessionConfig {
  const id = partial.id ?? newId()
  const enabledAttributes: GameAttributeName[] =
    partial.enabledAttributes ?? (["score", "coin"] as GameAttributeName[])
  const initialValues = partial.initialValues ?? {}
  const leaderboards =
    partial.leaderboards ??
    enabledAttributes.map((attribute) => ({
      id: attribute,
      attribute,
      sortOrder: "desc" as const,
      displayName:
        attribute === "coin" ? "Richest" : `${attribute[0]?.toUpperCase()}${attribute.slice(1)}`,
    }))

  return {
    id,
    name: partial.name,
    description: partial.description,
    enabledAttributes,
    initialValues,
    leaderboards,
    startsAt: partial.startsAt,
    endsAt: partial.endsAt,
    duration: partial.duration,
    mode: partial.mode ?? "individual",
    teams: partial.teams,
    segmentId: partial.segmentId,
    inventoryEnabled: partial.inventoryEnabled ?? true,
    maxInventorySlots: partial.maxInventorySlots ?? DEFAULT_SLOT_CAPS.inventory,
    maxCollectionSlots: partial.maxCollectionSlots ?? DEFAULT_SLOT_CAPS.collection,
    maxPlaybackSlots: partial.maxPlaybackSlots ?? DEFAULT_SLOT_CAPS.playback,
    allowTrading: partial.allowTrading ?? false,
    allowSelling: partial.allowSelling ?? true,
    physicalMediaWearForAdmins: partial.physicalMediaWearForAdmins ?? true,
  }
}
