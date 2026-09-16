import type { ArtifactContentInput, InventoryItem, ItemUseResult } from "@repo/types"
import { isStorageContainerDefinition } from "@repo/types"
import {
  planDeposit,
  sanitizeStashLabel,
  sanitizeStashNote,
} from "@repo/game-logic"
import {
  sendAttributedSystemMessage,
  resolveItemUseActorDisplayName,
} from "./resolveItemUseActorDisplayName"
import type { ItemUseHandler } from "./types"

function stashTextError(kind: "label" | "note"): string {
  return kind === "label"
    ? "Stash name must be 32 characters or fewer."
    : "Stash note must be 140 characters or fewer."
}

/**
 * Shared `use` handler for passworded stash containers (Van Cubby, Road Case, Trailer).
 * The container is consumed (leaves the bag and becomes `containerDefinitionId` on the stash).
 */
export function storeInContainer(): ItemUseHandler {
  return async (deps, userId, definition, callContext): Promise<ItemUseResult> => {
    const ctx = callContext as
      | {
          targetInventoryItemId?: string
          targetInventoryItemIds?: string[]
          password?: string
          label?: string
          note?: string
        }
      | undefined
    const fromArray = (ctx?.targetInventoryItemIds ?? [])
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean)
    const fromSingular = ctx?.targetInventoryItemId?.trim()
    const targetIds = fromArray.length > 0 ? fromArray : fromSingular ? [fromSingular] : []
    const password = typeof ctx?.password === "string" ? ctx.password : ""
    const capacity =
      typeof definition.storageCapacity === "number" && definition.storageCapacity > 0
        ? definition.storageCapacity
        : 1

    if (targetIds.length === 0) {
      return { success: false, consumed: false, message: "Select an item to store." }
    }
    if (!password) {
      return { success: false, consumed: false, message: "Enter a password to lock storage." }
    }

    const labelResult = sanitizeStashLabel(ctx?.label)
    if (labelResult.status === "too_long") {
      return { success: false, consumed: false, message: stashTextError("label") }
    }
    const noteResult = sanitizeStashNote(ctx?.note)
    if (noteResult.status === "too_long") {
      return { success: false, consumed: false, message: stashTextError("note") }
    }

    const { context, pluginName } = deps
    const inv = await context.inventory.getInventory(userId)
    const targets: InventoryItem[] = []
    for (const id of targetIds) {
      const target = inv.items.find((i) => i.itemId === id)
      if (!target) {
        return { success: false, consumed: false, message: "That item is not in your inventory." }
      }
      targets.push(target)
    }

    const incoming: ArtifactContentInput[] = []
    for (const target of targets) {
      const targetDef = await context.inventory.getItemDefinition(target.definitionId)
      if (isStorageContainerDefinition(targetDef)) {
        return { success: false, consumed: false, message: "You can't store that item." }
      }
      incoming.push({
        kind: "item",
        itemDefinitionId: target.definitionId,
        itemName: targetDef?.name ?? target.definitionId,
        itemQuantity: target.quantity,
        ...(target.metadata != null ? { metadata: target.metadata } : {}),
      })
    }

    const planned = planDeposit({ contents: [], capacity, incoming })
    if (planned.rejected.length > 0) {
      return { success: false, consumed: false, message: "That's more than this container can hold." }
    }

    const removed: InventoryItem[] = []
    for (const target of targets) {
      const ok = await context.inventory.removeItem(userId, target.itemId, target.quantity)
      if (!ok) {
        for (const row of removed) {
          await context.inventory.giveItem(userId, row.definitionId, row.quantity, row.metadata, "plugin")
        }
        return {
          success: false,
          consumed: false,
          message: "Could not remove the item from inventory.",
        }
      }
      removed.push(target)
    }

    try {
      await context.artifacts.store({
        storingPlugin: pluginName,
        storingItemId: definition.shortId,
        artifactType: "item",
        storedAt: Date.now(),
        storedByUserId: userId,
        storedByUsername:
          (await context.api.getUsersByIds([userId]).then((u) => u[0]?.username?.trim())) ||
          "Unknown",
        password,
        contents: planned.nextContents as typeof planned.nextContents,
        containerDefinitionId: definition.id,
        ...(labelResult.status === "ok" ? { label: labelResult.value } : {}),
        ...(noteResult.status === "ok" ? { note: noteResult.value } : {}),
      })
    } catch (e) {
      for (const row of removed) {
        await context.inventory.giveItem(userId, row.definitionId, row.quantity, row.metadata, "plugin")
      }
      console.error(`[${definition.shortId}] store failed, refunded items`, e)
      return { success: false, consumed: false, message: "Could not store the artifact." }
    }

    const displayName = await resolveItemUseActorDisplayName(deps, userId)
    const names = incoming
      .filter((c): c is Extract<ArtifactContentInput, { kind: "item" }> => c.kind === "item")
      .map((c) => c.itemName)
    const what =
      names.length === 1 ? names[0]! : names.length === 2 ? `${names[0]} and ${names[1]}` : `${names.length} items`
    await sendAttributedSystemMessage(
      deps,
      `${displayName.label} stashed ${what} in the ${definition.name}.`,
      displayName,
    )

    return { success: true, consumed: true, message: "Item locked away in storage." }
  }
}

export function storeCoinsInContainer(): ItemUseHandler {
  return async (deps, userId, definition, callContext): Promise<ItemUseResult> => {
    const ctx = callContext as
      | { coinAmount?: number; password?: string; label?: string; note?: string }
      | undefined
    const rawAmount = ctx?.coinAmount
    const coinAmount =
      typeof rawAmount === "number" && Number.isFinite(rawAmount) ? Math.floor(rawAmount) : NaN
    const password = typeof ctx?.password === "string" ? ctx.password : ""

    if (!Number.isFinite(coinAmount) || coinAmount < 1) {
      return { success: false, consumed: false, message: "Enter a positive coin amount to store." }
    }
    if (!password) {
      return { success: false, consumed: false, message: "Enter a password to lock storage." }
    }

    const labelResult = sanitizeStashLabel(ctx?.label)
    if (labelResult.status === "too_long") {
      return { success: false, consumed: false, message: stashTextError("label") }
    }
    const noteResult = sanitizeStashNote(ctx?.note)
    if (noteResult.status === "too_long") {
      return { success: false, consumed: false, message: stashTextError("note") }
    }

    const { context, pluginName, game } = deps
    const state = await game.getUserState(userId)
    const current = state?.attributes?.coin ?? 0
    if (current < coinAmount) {
      return { success: false, consumed: false, message: "You don't have enough coins." }
    }

    await game.addScore(userId, "coin", -coinAmount, `${definition.shortId}:store`, {
      intent: "exact",
    })

    try {
      await context.artifacts.store({
        storingPlugin: pluginName,
        storingItemId: definition.shortId,
        artifactType: "coin",
        storedAt: Date.now(),
        storedByUserId: userId,
        storedByUsername:
          (await context.api.getUsersByIds([userId]).then((u) => u[0]?.username?.trim())) ||
          "Unknown",
        password,
        contents: [{ kind: "coin", coinValue: coinAmount }],
        containerDefinitionId: definition.id,
        ...(labelResult.status === "ok" ? { label: labelResult.value } : {}),
        ...(noteResult.status === "ok" ? { note: noteResult.value } : {}),
      })
    } catch (e) {
      await game.addScore(userId, "coin", coinAmount, `${definition.shortId}:store-refund`, {
        intent: "exact",
      })
      console.error(`[${definition.shortId}] store failed, refunded coins`, e)
      return { success: false, consumed: false, message: "Could not store coins." }
    }

    const displayName = await resolveItemUseActorDisplayName(deps, userId)
    await sendAttributedSystemMessage(
      deps,
      `${displayName.label} locked ${coinAmount.toLocaleString()} coins in the ${definition.name}.`,
      displayName,
    )

    return { success: true, consumed: true, message: "Coins stored safely." }
  }
}
