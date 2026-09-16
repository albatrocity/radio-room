import type { ArtifactContent, ArtifactContentInput, InventoryItem } from "@repo/types"
import type { PlanWithdrawalResult } from "./artifactStash"

/** What to persist after a planned withdrawal (ADR 0179 / 0181). */
export function withdrawalPersistAction(
  plan: Pick<PlanWithdrawalResult, "container" | "remainder">,
  containerDefinitionId?: string | null,
): { type: "remove" } | { type: "update"; contents: ArtifactContent[] } {
  if (plan.container) return { type: "remove" }
  if (plan.remainder.length === 0 && containerDefinitionId?.trim()) {
    return { type: "update", contents: [] }
  }
  if (plan.remainder.length === 0) return { type: "remove" }
  return { type: "update", contents: plan.remainder }
}

export type WithdrawalDeliveryPorts = {
  addCoins: (amount: number, reason: string) => Promise<unknown>
  giveItem: (
    definitionId: string,
    quantity: number,
    metadata?: Record<string, unknown>,
  ) => Promise<{ itemId: string } | null>
  removeItem: (itemId: string, quantity: number) => Promise<unknown>
}

export type WithdrawalDeliveryResult =
  | { ok: true }
  | {
      ok: false
      code: "invalid_coins" | "invalid_item" | "give_failed"
      failedItem?: ArtifactContent
    }

/**
 * Credit deliveries (and optional container) with rollback. Used by the server
 * retrieve operation and Game Studio's `retrieveArtifact`.
 */
export async function applyWithdrawalDeliveries(params: {
  deliveries: ArtifactContent[]
  container?: { definitionId: string }
  ports: WithdrawalDeliveryPorts
}): Promise<WithdrawalDeliveryResult> {
  for (const d of params.deliveries) {
    if (d.kind === "coin" && d.coinValue < 1) return { ok: false, code: "invalid_coins" }
    if (d.kind === "item" && (!d.itemDefinitionId || d.itemQuantity < 1)) {
      return { ok: false, code: "invalid_item" }
    }
  }

  const given: { itemId: string; quantity: number }[] = []
  let coinsAdded = 0

  const rollback = async () => {
    if (coinsAdded > 0) {
      await params.ports.addCoins(-coinsAdded, "stored-artifact:retrieve-rollback")
    }
    for (const row of given) {
      await params.ports.removeItem(row.itemId, row.quantity)
    }
  }

  try {
    for (const delivery of params.deliveries) {
      if (delivery.kind === "coin") {
        await params.ports.addCoins(delivery.coinValue, "stored-artifact:retrieve")
        coinsAdded += delivery.coinValue
        continue
      }
      const givenItem = await params.ports.giveItem(
        delivery.itemDefinitionId,
        delivery.itemQuantity,
        delivery.metadata,
      )
      if (!givenItem) {
        await rollback()
        return { ok: false, code: "give_failed", failedItem: delivery }
      }
      given.push({ itemId: givenItem.itemId, quantity: delivery.itemQuantity })
    }

    if (params.container) {
      const containerItem = await params.ports.giveItem(params.container.definitionId, 1, undefined)
      if (!containerItem) {
        await rollback()
        return { ok: false, code: "give_failed" }
      }
      given.push({ itemId: containerItem.itemId, quantity: 1 })
    }
  } catch (e) {
    await rollback()
    throw e
  }

  return { ok: true }
}

export type DepositStackRef = Pick<InventoryItem, "itemId" | "definitionId" | "quantity"> & {
  metadata?: Record<string, unknown>
}

export type DepositMutationPorts = {
  removeItem: (itemId: string, quantity: number) => Promise<boolean>
  giveItem: (
    definitionId: string,
    quantity: number,
    metadata?: Record<string, unknown>,
  ) => Promise<unknown>
  debitCoins: (amount: number) => Promise<unknown>
  creditCoins: (amount: number) => Promise<unknown>
  updateArtifact: (contents: ArtifactContentInput[]) => Promise<unknown | null>
}

/**
 * Take items/coins then patch the stash, refunding on failure. Used by the
 * server deposit operation and Game Studio's `depositArtifact`.
 */
export async function applyDepositMutations(params: {
  stacks: DepositStackRef[]
  coinAmount: number
  nextContents: ArtifactContentInput[]
  ports: DepositMutationPorts
}): Promise<{ ok: true } | { ok: false; message: string }> {
  const { stacks, coinAmount, nextContents, ports } = params
  const removed: DepositStackRef[] = []
  let coinsDebited = false

  const restore = async () => {
    for (const row of removed) {
      await ports.giveItem(row.definitionId, row.quantity, row.metadata)
    }
    if (coinsDebited) {
      await ports.creditCoins(coinAmount)
    }
  }

  for (const stack of stacks) {
    const ok = await ports.removeItem(stack.itemId, stack.quantity)
    if (!ok) {
      await restore()
      return { ok: false, message: "Could not remove the item from inventory." }
    }
    removed.push(stack)
  }

  if (coinAmount > 0) {
    await ports.debitCoins(coinAmount)
    coinsDebited = true
  }

  try {
    const updated = await ports.updateArtifact(nextContents)
    if (!updated) {
      throw new Error("UPDATE_FAILED")
    }
  } catch {
    await restore()
    return { ok: false, message: "Could not add to the stash." }
  }

  return { ok: true }
}
