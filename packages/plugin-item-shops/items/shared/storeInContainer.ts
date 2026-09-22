import type {
  ArtifactContentInput,
  InventoryItem,
  ItemDefinition,
  ItemUseResult,
  PluginActionFormField,
} from "@repo/types"
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
import type { ItemShopsBehaviorDeps, ItemUseHandler } from "./types"

function stashTextError(kind: "label" | "note"): string {
  return kind === "label"
    ? "Stash name must be 32 characters or fewer."
    : "Stash note must be 140 characters or fewer."
}

/** Shared password / optional label+note fields for stash containers (ADR 0187 / 0193). */
export const stashLockFormFields: PluginActionFormField[] = [
  {
    name: "password",
    label: "Password",
    type: "password",
    required: true,
    placeholder: "Password",
  },
  {
    name: "label",
    label: "Stash name",
    type: "string",
    required: false,
    maxLength: 32,
    placeholder: "Optional name",
  },
  {
    name: "note",
    label: "Note",
    type: "string",
    required: false,
    maxLength: 140,
    placeholder: "Typically a password hint",
  },
]

function readFormValues(callContext: unknown): Record<string, string | number> {
  if (!callContext || typeof callContext !== "object" || Array.isArray(callContext)) {
    return {}
  }
  return (callContext as { formValues?: Record<string, string | number> }).formValues ?? {}
}

/**
 * Shared `use` handler for passworded stash containers (Van Cubby, Road Case, Trailer).
 * The container is consumed (leaves the bag and becomes `containerDefinitionId` on the stash).
 * Password / label / note come from `callContext.formValues` (ADR 0187 / 0193).
 */
export function storeInContainer(): ItemUseHandler {
  return async (deps, userId, definition, callContext): Promise<ItemUseResult> => {
    const ctx = callContext as
      | {
          targetInventoryItemId?: string
          targetInventoryItemIds?: string[]
        }
      | undefined
    const formValues = readFormValues(callContext)
    const fromArray = (ctx?.targetInventoryItemIds ?? [])
      .map((id) => (typeof id === "string" ? id.trim() : ""))
      .filter(Boolean)
    const fromSingular = ctx?.targetInventoryItemId?.trim()
    const targetIds = fromArray.length > 0 ? fromArray : fromSingular ? [fromSingular] : []
    const password = typeof formValues.password === "string" ? formValues.password : ""
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

    const labelResult = sanitizeStashLabel(
      typeof formValues.label === "string" ? formValues.label : undefined,
    )
    if (labelResult.status === "too_long") {
      return { success: false, consumed: false, message: stashTextError("label") }
    }
    const noteResult = sanitizeStashNote(
      typeof formValues.note === "string" ? formValues.note : undefined,
    )
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

    const uniqueDefIds = [...new Set(targets.map((t) => t.definitionId).filter(Boolean))]
    const targetDefByLookup = new Map<string, ItemDefinition>()
    await Promise.all(
      uniqueDefIds.map(async (id) => {
        const def = await context.inventory.resolveDefinition(id, { pluginName })
        if (def) targetDefByLookup.set(id, def)
      }),
    )

    const incoming: ArtifactContentInput[] = []
    for (const target of targets) {
      const targetDef = targetDefByLookup.get(target.definitionId)
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
    const formValues = readFormValues(callContext)
    const rawAmount = formValues.coinAmount
    const coinAmount =
      typeof rawAmount === "number" && Number.isFinite(rawAmount) ? Math.floor(rawAmount) : NaN
    const password = typeof formValues.password === "string" ? formValues.password : ""

    if (!Number.isFinite(coinAmount) || coinAmount < 1) {
      return { success: false, consumed: false, message: "Enter a positive coin amount to store." }
    }
    if (!password) {
      return { success: false, consumed: false, message: "Enter a password to lock storage." }
    }

    const labelResult = sanitizeStashLabel(
      typeof formValues.label === "string" ? formValues.label : undefined,
    )
    if (labelResult.status === "too_long") {
      return { success: false, consumed: false, message: stashTextError("label") }
    }
    const noteResult = sanitizeStashNote(
      typeof formValues.note === "string" ? formValues.note : undefined,
    )
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
