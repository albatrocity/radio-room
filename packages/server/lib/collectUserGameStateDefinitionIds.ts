import type { GiftOffer, TradeSession, UserGameState, UserInventory } from "@repo/types"

/**
 * Definition ids needed to render a user's inventory and modifiers on
 * `USER_GAME_STATE`. Shop-offer extras come from plugins via
 * `referencedItemDefinitionIdsForUser` (see ADR 0097). Pending-gift SKUs are
 * collected separately — escrowed items are no longer in the bag. Active-trade
 * draft/offer SKUs (including the counterpart’s) are collected so trade-session
 * artwork can render without the full catalog.
 */
export function collectInventoryAndModifierDefinitionIds(
  inventory: UserInventory | null | undefined,
  state: UserGameState | null | undefined,
): string[] {
  const ids = new Set<string>()
  for (const item of inventory?.items ?? []) {
    const id = item.definitionId?.trim()
    if (id) ids.add(id)
  }
  for (const modifier of state?.modifiers ?? []) {
    const id = modifier.itemDefinitionId?.trim()
    if (id) ids.add(id)
  }
  return [...ids]
}

/** Definition ids for pending gifts (incoming and outgoing). */
export function collectGiftOfferDefinitionIds(offers: readonly GiftOffer[]): string[] {
  const ids = new Set<string>()
  for (const offer of offers) {
    const id = offer.definitionId?.trim()
    if (id) ids.add(id)
  }
  return [...ids]
}

/** Definition ids on every participant’s draft and escrowed offer. */
export function collectTradeSessionDefinitionIds(
  trade: TradeSession | null | undefined,
): string[] {
  if (!trade?.participants) return []
  const ids = new Set<string>()
  for (const participant of Object.values(trade.participants)) {
    for (const row of [...(participant.draft ?? []), ...(participant.offer ?? [])]) {
      const id = row.definitionId?.trim()
      if (id) ids.add(id)
    }
  }
  return [...ids]
}
