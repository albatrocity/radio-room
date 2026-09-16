import type { AppContext, ArtifactContent, ItemDefinition, ItemSlotPool } from "@repo/types"
import {
  computeFreeSlotsByPool,
  planWithdrawal,
  readArtifactContents,
  summarizeWithdrawal,
} from "@repo/game-logic"
import { resolveSlotPool, slotPoolFullMessage } from "@repo/types"
import type { GameSessionService } from "../../services/GameSessionService"
import { postSystemChatMessage } from "../polls/postSystemChatMessage"
import { displayName } from "./transferEvents"

export type StoredArtifactActionResult = {
  success: boolean
  message: string
}

function definitionsRecord(defs: ItemDefinition[]): Record<string, ItemDefinition | undefined> {
  const out: Record<string, ItemDefinition | undefined> = {}
  for (const def of defs) out[def.id] = def
  return out
}

async function loadDefinitions(
  inventory: NonNullable<AppContext["inventory"]>,
  roomId: string,
  ids: string[],
): Promise<Record<string, ItemDefinition | undefined>> {
  const unique = [...new Set(ids.filter(Boolean))]
  if (unique.length === 0) return {}
  const defs = (await inventory.getItemDefinitions(roomId, unique)) as ItemDefinition[]
  return definitionsRecord(defs)
}

async function overflowMessage(
  inventory: NonNullable<AppContext["inventory"]>,
  roomId: string,
  rejected: ArtifactContent[],
  containerDefinitionId?: string,
): Promise<string> {
  const firstItem = rejected.find((c) => c.kind === "item")
  const defId = firstItem?.itemDefinitionId ?? containerDefinitionId
  const def = defId ? await inventory.getItemDefinition(roomId, defId) : null
  const pool: ItemSlotPool = resolveSlotPool(def)
  return slotPoolFullMessage(pool, "make space and try again.")
}

/**
 * Unlock selected (or all) contents of a stored artifact into the user's bags.
 */
export async function retrieveStoredArtifact(params: {
  roomId: string
  userId: string
  artifactId?: string
  password?: string
  contentIds?: string[]
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
          `${username} tried to retrieve storage that is no longer here.`,
          "That stored item no longer exists.",
        )
      }
      if (attempt.status === "wrong_password") {
        return failRoom(
          `${username} failed to retrieve an artifact from storage (wrong password).`,
          "Wrong password.",
        )
      }

      const art = attempt.artifact
      const contents = readArtifactContents(art)
      // An empty stash is retrieved to claim its container, so it takes no
      // content selection (ADR 0181).
      if (params.contentIds != null && params.contentIds.length === 0 && contents.length > 0) {
        return { success: false, message: "Select what to take." }
      }

      const inv = await inventory.getInventory(roomId, userId)
      const defIds = [
        ...contents.filter((c) => c.kind === "item").map((c) => c.itemDefinitionId),
        art.containerDefinitionId ?? "",
      ]
      const definitionsById = await loadDefinitions(inventory, roomId, defIds)
      const freeSlotsByPool = computeFreeSlotsByPool(inv.items, inv, definitionsById)

      const plan = planWithdrawal({
        contents,
        selectedIds: params.contentIds,
        containerDefinitionId: art.containerDefinitionId,
        freeSlotsByPool,
        definitionsById,
      })

      if (plan.rejected.length > 0) {
        return {
          success: false,
          message: await overflowMessage(
            inventory,
            roomId,
            plan.rejected,
            plan.container?.definitionId,
          ),
        }
      }
      if (plan.deliveries.length === 0 && !plan.container) {
        if (plan.containerBlocked) {
          return {
            success: false,
            message: await overflowMessage(
              inventory,
              roomId,
              [],
              art.containerDefinitionId ?? undefined,
            ),
          }
        }
        return { success: false, message: "Nothing to retrieve." }
      }

      const given: { itemId: string; quantity: number }[] = []
      let coinsAdded = 0
      try {
        for (const delivery of plan.deliveries) {
          if (delivery.kind === "coin") {
            if (delivery.coinValue < 1) {
              return { success: false, message: "Invalid stored coins." }
            }
            await gameSessions.addScore(
              roomId,
              userId,
              "coin",
              delivery.coinValue,
              "stored-artifact:retrieve",
              { intent: "exact" },
            )
            coinsAdded += delivery.coinValue
            continue
          }
          if (!delivery.itemDefinitionId || delivery.itemQuantity < 1) {
            return { success: false, message: "Invalid stored item." }
          }
          const givenItem = await inventory.giveItem(
            roomId,
            userId,
            delivery.itemDefinitionId,
            delivery.itemQuantity,
            delivery.metadata,
            "plugin",
          )
          if (!givenItem) {
            throw new Error("GIVE_FAILED")
          }
          given.push({ itemId: givenItem.itemId, quantity: delivery.itemQuantity })
        }

        if (plan.container) {
          const containerItem = await inventory.giveItem(
            roomId,
            userId,
            plan.container.definitionId,
            1,
            undefined,
            "plugin",
          )
          if (!containerItem) {
            throw new Error("GIVE_FAILED")
          }
          given.push({ itemId: containerItem.itemId, quantity: 1 })
        }
      } catch (e) {
        if (coinsAdded > 0) {
          await gameSessions.addScore(
            roomId,
            userId,
            "coin",
            -coinsAdded,
            "stored-artifact:retrieve-rollback",
            { intent: "exact" },
          )
        }
        for (const row of given) {
          await inventory.removeItem(roomId, userId, row.itemId, row.quantity)
        }
        if (e instanceof Error && e.message === "GIVE_FAILED") {
          const failed = plan.deliveries.find((d) => d.kind === "item")
          return {
            success: false,
            message: await overflowMessage(
              inventory,
              roomId,
              failed ? [failed] : [],
              plan.container?.definitionId,
            ),
          }
        }
        throw e
      }

      if (plan.container) {
        await artifacts.remove(artifactId)
      } else if (plan.remainder.length === 0 && art.containerDefinitionId?.trim()) {
        // The container had no free slot, so the stash stays listed as an empty
        // row that anyone with the password can claim later (ADR 0181).
        await artifacts.update(artifactId, { contents: [] })
      } else if (plan.remainder.length === 0) {
        await artifacts.remove(artifactId)
      } else {
        await artifacts.update(artifactId, { contents: plan.remainder })
      }

      const containerDef = plan.container
        ? definitionsById[plan.container.definitionId]
        : art.containerDefinitionId
          ? definitionsById[art.containerDefinitionId]
          : undefined
      const summary = summarizeWithdrawal({
        username,
        deliveries: plan.deliveries,
        containerName: containerDef?.name ?? null,
        containerReturned: Boolean(plan.container),
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
