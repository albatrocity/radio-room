import type { GameAttributeName, GameSessionConfig } from "@repo/types"
import { newId } from "./id"

const DEFAULT_INVENTORY_SLOTS = 3

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
    maxInventorySlots: partial.maxInventorySlots ?? DEFAULT_INVENTORY_SLOTS,
    allowTrading: partial.allowTrading ?? false,
    allowSelling: partial.allowSelling ?? true,
  }
}
