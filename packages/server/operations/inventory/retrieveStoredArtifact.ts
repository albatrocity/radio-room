import type { AppContext, ArtifactContent, ItemDefinition, ItemSlotPool } from "@repo/types"
import {
  applyWithdrawalDeliveries,
  authorizeArtifactRetrieve,
  computeFreeSlotsByPool,
  planWithdrawal,
  readArtifactContents,
  STASH_NO_GRANT_MESSAGE,
  summarizeWithdrawal,
  withdrawalPersistAction,
} from "@repo/game-logic"
import { resolveSlotPool, slotPoolFullMessage } from "@repo/types"
import type { GameSessionService } from "../../services/GameSessionService"
import { postSystemChatMessage } from "../polls/postSystemChatMessage"
import { displayNameWithMaskMeta } from "./transferEvents"

export type StoredArtifactActionResult = {
  success: boolean
  message: string
}

function definitionsRecord(defs: ItemDefinition[]): Record<string, ItemDefinition | undefined> {
  const out: Record<string, ItemDefinition | undefined> = {}
  for (const def of defs) out[def.id] = def
  return out
}

export async function loadDefinitions(
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
 * Game Studio's `retrieveArtifact` is the other caller of `applyWithdrawalDeliveries`.
 */
export async function retrieveStoredArtifact(params: {
  roomId: string
  userId: string
  artifactId?: string
  password?: string
  useAccessGrant?: boolean
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
  const useGrant = params.useAccessGrant === true
  if (!artifactId || (!password && !useGrant)) {
    return { success: false, message: "Artifact id and password are required." }
  }

  const usernameAttr = await displayNameWithMaskMeta(context, roomId, userId)
  const username = usernameAttr.label
  const roomChatMeta = usernameAttr.masked
    ? { maskedUserIds: [usernameAttr.userId], maskedLabel: usernameAttr.label }
    : undefined

  let roomChat: string | undefined

  try {
    const result = await artifacts.withArtifactLock(artifactId, async () => {
      const attempt = await authorizeArtifactRetrieve({
        artifacts,
        artifactId,
        userId,
        password,
        useGrant,
      })

      if (attempt.status === "not_found") {
        roomChat = `${username} tried to retrieve storage that is no longer here.`
        return { success: false, message: "That stored item no longer exists." }
      }
      if (attempt.status === "wrong_password") {
        roomChat = `${username} failed to retrieve an artifact from storage (wrong password).`
        return { success: false, message: "Wrong password." }
      }
      if (attempt.status === "no_grant") {
        return { success: false, message: STASH_NO_GRANT_MESSAGE }
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

      const delivered = await applyWithdrawalDeliveries({
        deliveries: plan.deliveries,
        container: plan.container,
        ports: {
          addCoins: (amount, reason) =>
            gameSessions.addScore(roomId, userId, "coin", amount, reason, { intent: "exact" }),
          giveItem: async (definitionId, quantity, metadata) =>
            inventory.giveItem(roomId, userId, definitionId, quantity, metadata, "plugin"),
          removeItem: (itemId, quantity) => inventory.removeItem(roomId, userId, itemId, quantity),
        },
      })
      if (!delivered.ok) {
        if (delivered.code === "invalid_coins") {
          return { success: false, message: "Invalid stored coins." }
        }
        if (delivered.code === "invalid_item") {
          return { success: false, message: "Invalid stored item." }
        }
        return {
          success: false,
          message: await overflowMessage(
            inventory,
            roomId,
            delivered.failedItem ? [delivered.failedItem] : [],
            plan.container?.definitionId,
          ),
        }
      }

      const persist = withdrawalPersistAction(plan, art.containerDefinitionId)
      if (persist.type === "remove") {
        await artifacts.remove(artifactId)
      } else {
        await artifacts.update(artifactId, { contents: persist.contents })
      }
      if (useGrant) {
        await artifacts.revokeAccessGrant(artifactId, userId)
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
      roomChat = summary.roomMessage
      return { success: true, message: summary.privateMessage }
    })
    if (roomChat) {
      await postSystemChatMessage({
        context,
        roomId,
        content: roomChat,
        meta: roomChatMeta,
      })
    }
    return result
  } catch (e) {
    if (e instanceof Error && e.message.includes("could not acquire artifact lock")) {
      return { success: false, message: "That stash is busy. Try again." }
    }
    throw e
  }
}
