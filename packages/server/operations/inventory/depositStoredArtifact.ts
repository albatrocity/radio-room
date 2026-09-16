import type { AppContext, ArtifactContentInput } from "@repo/types"
import { isStorageContainerDefinition } from "@repo/types"
import {
  applyDepositMutations,
  planDeposit,
  readArtifactContents,
  summarizeDeposit,
} from "@repo/game-logic"
import type { GameSessionService } from "../../services/GameSessionService"
import { postSystemChatMessage } from "../polls/postSystemChatMessage"
import { displayName } from "./transferEvents"
import {
  loadDefinitions,
  type StoredArtifactActionResult,
} from "./retrieveStoredArtifact"

/**
 * Add inventory stacks and/or coins to an existing passworded stash.
 * Game Studio's `depositArtifact` is the other caller of `applyDepositMutations`.
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

  let roomChat: string | undefined

  try {
    const result = await artifacts.withArtifactLock(artifactId, async () => {
      const attempt = await artifacts.attemptRetrieve(artifactId, password)
      if (attempt.status === "not_found") {
        roomChat = `${username} tried to add to storage that is no longer here.`
        return { success: false, message: "That stored item no longer exists." }
      }
      if (attempt.status === "wrong_password") {
        roomChat = `${username} failed to add to a stash (wrong password).`
        return { success: false, message: "Wrong password." }
      }

      const art = attempt.artifact
      const contents = readArtifactContents(art)
      const inv = await inventory.getInventory(roomId, userId)

      const incoming: ArtifactContentInput[] = []
      const stacks: {
        itemId: string
        definitionId: string
        quantity: number
        metadata?: Record<string, unknown>
      }[] = []

      const targetIds = (params.targetInventoryItemIds ?? []).map((id) => id.trim()).filter(Boolean)
      for (const itemId of targetIds) {
        const stack = inv.items.find((i) => i.itemId === itemId)
        if (!stack) {
          return { success: false, message: "That item is not in your inventory." }
        }
        stacks.push(stack)
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
      }

      if (stacks.length === 0 && coinAmount <= 0) {
        return { success: false, message: "Nothing to add." }
      }

      const definitionsById = await loadDefinitions(inventory, roomId, [
        ...stacks.map((s) => s.definitionId),
        art.containerDefinitionId ?? "",
      ])

      for (const stack of stacks) {
        const def = definitionsById[stack.definitionId]
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

      if (coinAmount > 0) {
        incoming.push({ kind: "coin", coinValue: coinAmount })
      }

      let capacity = Math.max(contents.length, 1)
      if (art.containerDefinitionId) {
        const containerDef = definitionsById[art.containerDefinitionId]
        if (typeof containerDef?.storageCapacity === "number" && containerDef.storageCapacity > 0) {
          capacity = containerDef.storageCapacity
        }
      }

      const plan = planDeposit({ contents, capacity, incoming })
      if (plan.rejected.length > 0) {
        return { success: false, message: "That stash is full." }
      }

      const mutated = await applyDepositMutations({
        stacks,
        coinAmount,
        nextContents: plan.nextContents,
        ports: {
          removeItem: (itemId, quantity) => inventory.removeItem(roomId, userId, itemId, quantity),
          giveItem: (definitionId, quantity, metadata) =>
            inventory.giveItem(roomId, userId, definitionId, quantity, metadata, "plugin"),
          debitCoins: (amount) =>
            gameSessions.addScore(roomId, userId, "coin", -amount, "stored-artifact:deposit", {
              intent: "exact",
            }),
          creditCoins: (amount) =>
            gameSessions.addScore(
              roomId,
              userId,
              "coin",
              amount,
              "stored-artifact:deposit-refund",
              { intent: "exact" },
            ),
          updateArtifact: (nextContents) => artifacts.update(artifactId, { contents: nextContents }),
        },
      })
      if (!mutated.ok) {
        return { success: false, message: mutated.message }
      }

      const containerDef = art.containerDefinitionId
        ? definitionsById[art.containerDefinitionId]
        : undefined
      const summary = summarizeDeposit({
        username,
        incoming,
        containerName: containerDef?.name ?? null,
      })
      roomChat = summary.roomMessage
      return { success: true, message: summary.privateMessage }
    })
    if (roomChat) {
      await postSystemChatMessage({ context, roomId, content: roomChat })
    }
    return result
  } catch (e) {
    if (e instanceof Error && e.message.includes("could not acquire artifact lock")) {
      return { success: false, message: "That stash is busy. Try again." }
    }
    throw e
  }
}
