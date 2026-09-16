import type { AppContext, ArtifactContentInput, ArtifactUpdatePatch, InventoryItem } from "@repo/types"
import { isStorageContainerDefinition } from "@repo/types"
import {
  planDeposit,
  readArtifactContents,
  summarizeDeposit,
} from "@repo/game-logic"
import type { GameSessionService } from "../../services/GameSessionService"
import { postSystemChatMessage } from "../polls/postSystemChatMessage"
import { displayName } from "./transferEvents"
import type { StoredArtifactActionResult } from "./retrieveStoredArtifact"

/**
 * Add inventory stacks and/or coins to an existing passworded stash.
 */
export async function depositStoredArtifact(params: {
  roomId: string
  userId: string
  artifactId?: string
  password?: string
  targetInventoryItemIds?: string[]
  coinAmount?: number
  context: AppContext
}): Promise<StoredArtifactActionResult> {
  const { roomId, userId, context } = params
  const artifacts = context.artifacts
  const inventory = context.inventory
  const gameSessions = context.gameSessions as GameSessionService | undefined

  if (!artifacts || !inventory || !gameSessions) {
    return { success: false, message: "Service unavailable." }
  }

  const artifactId = params.artifactId?.trim()
  const password = typeof params.password === "string" ? params.password : ""
  if (!artifactId || !password) {
    return { success: false, message: "Artifact id and password are required." }
  }

  const username = await displayName(context, userId, roomId)

  const failRoom = async (roomLine: string, message: string) => {
    await postSystemChatMessage({ context, roomId, content: roomLine })
    return { success: false, message }
  }

  try {
    return await artifacts.withArtifactLock(artifactId, async () => {
      const attempt = await artifacts.attemptRetrieve(artifactId, password)
      if (attempt.status === "not_found") {
        return failRoom(
          `${username} tried to add to storage that is no longer here.`,
          "That stored item no longer exists.",
        )
      }
      if (attempt.status === "wrong_password") {
        return failRoom(
          `${username} failed to add to a stash (wrong password).`,
          "Wrong password.",
        )
      }

      const art = attempt.artifact
      const contents = readArtifactContents(art)
      const inv = await inventory.getInventory(roomId, userId)

      const incoming: ArtifactContentInput[] = []
      const removed: InventoryItem[] = []

      const targetIds = (params.targetInventoryItemIds ?? []).map((id) => id.trim()).filter(Boolean)
      for (const itemId of targetIds) {
        const stack = inv.items.find((i: InventoryItem) => i.itemId === itemId)
        if (!stack) {
          return { success: false, message: "That item is not in your inventory." }
        }
        const def = await inventory.getItemDefinition(roomId, stack.definitionId)
        if (isStorageContainerDefinition(def)) {
          return { success: false, message: "You can't store that item." }
        }
        incoming.push({
          kind: "item",
          itemDefinitionId: stack.definitionId,
          itemName: def?.name ?? stack.definitionId,
          itemQuantity: stack.quantity,
          ...(stack.metadata != null ? { metadata: stack.metadata } : {}),
        })
      }

      const rawAmount = params.coinAmount
      const coinAmount =
        typeof rawAmount === "number" && Number.isFinite(rawAmount) ? Math.floor(rawAmount) : 0
      if (coinAmount > 0) {
        const state = await gameSessions.getUserState(roomId, userId)
        const current = state?.attributes?.coin ?? 0
        if (current < coinAmount) {
          return { success: false, message: "You don't have enough coins." }
        }
        incoming.push({ kind: "coin", coinValue: coinAmount })
      }

      if (incoming.length === 0) {
        return { success: false, message: "Nothing to add." }
      }

      let capacity = Math.max(contents.length, 1)
      if (art.containerDefinitionId) {
        const containerDef = await inventory.getItemDefinition(roomId, art.containerDefinitionId)
        if (typeof containerDef?.storageCapacity === "number" && containerDef.storageCapacity > 0) {
          capacity = containerDef.storageCapacity
        }
      }

      const plan = planDeposit({ contents, capacity, incoming })
      if (plan.rejected.length > 0) {
        return { success: false, message: "That stash is full." }
      }

      for (const itemId of targetIds) {
        const stack = inv.items.find((i: InventoryItem) => i.itemId === itemId)
        if (!stack) continue
        const ok = await inventory.removeItem(roomId, userId, stack.itemId, stack.quantity)
        if (!ok) {
          for (const row of removed) {
            await inventory.giveItem(roomId, userId, row.definitionId, row.quantity, row.metadata, "plugin")
          }
          return { success: false, message: "Could not remove the item from inventory." }
        }
        removed.push(stack)
      }

      if (coinAmount > 0) {
        await gameSessions.addScore(
          roomId,
          userId,
          "coin",
          -coinAmount,
          "stored-artifact:deposit",
          { intent: "exact" },
        )
      }

      const patch: ArtifactUpdatePatch = { contents: plan.nextContents }

      try {
        const updated = await artifacts.update(artifactId, patch)
        if (!updated) {
          throw new Error("UPDATE_FAILED")
        }
      } catch (e) {
        for (const row of removed) {
          await inventory.giveItem(
            roomId,
            userId,
            row.definitionId,
            row.quantity,
            row.metadata,
            "plugin",
          )
        }
        if (coinAmount > 0) {
          await gameSessions.addScore(
            roomId,
            userId,
            "coin",
            coinAmount,
            "stored-artifact:deposit-refund",
            { intent: "exact" },
          )
        }
        console.error("[depositStoredArtifact] update failed, refunded", e)
        return { success: false, message: "Could not add to the stash." }
      }

      const containerDef = art.containerDefinitionId
        ? await inventory.getItemDefinition(roomId, art.containerDefinitionId)
        : null
      const summary = summarizeDeposit({
        username,
        incoming,
        containerName: containerDef?.name ?? null,
      })
      await postSystemChatMessage({ context, roomId, content: summary.roomMessage })
      return { success: true, message: summary.privateMessage }
    })
  } catch (e) {
    if (e instanceof Error && e.message.includes("could not acquire artifact lock")) {
      return { success: false, message: "That stash is busy. Try again." }
    }
    throw e
  }
}
