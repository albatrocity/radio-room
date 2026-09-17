import {
  isStashPickable,
  stashNotPickableMessage,
  stashUntouchedForMs,
} from "@repo/game-logic"
import type { ItemDefinition, ItemUseResult, StoredArtifactPublic } from "@repo/types"
import {
  resolveItemUseActorDisplayName,
  sendAttributedSystemMessage,
} from "./resolveItemUseActorDisplayName"
import {
  issueStashPickGrant,
  rollCrackAttempt,
  type CrackResolver,
} from "./crackStash"
import type { ItemShopsBehaviorDeps, ItemUseHandler } from "./types"

type LockPickingCallContext = {
  targetArtifactId?: string
}

async function resolveContainerDisplayName(
  deps: ItemShopsBehaviorDeps,
  artifact: StoredArtifactPublic,
): Promise<string> {
  const hydrated = artifact.containerName?.trim()
  if (hydrated) return hydrated

  const containerId = artifact.containerDefinitionId?.trim()
  if (containerId) {
    const def = await deps.context.inventory.getItemDefinition(containerId)
    const name = def?.name?.trim()
    if (name) return name
  }

  return "a stash"
}

export function useLockPickingItem(options: {
  successChance: number
  resolve?: CrackResolver
  random?: () => number
}): ItemUseHandler {
  const resolve = options.resolve ?? rollCrackAttempt
  const random = options.random

  return async function useLockPickingItemHandler(
    deps: ItemShopsBehaviorDeps,
    userId: string,
    definition: ItemDefinition,
    callContext?: unknown,
  ): Promise<ItemUseResult> {
    const ctx = callContext as LockPickingCallContext | undefined
    const targetArtifactId = ctx?.targetArtifactId?.trim()

    if (!targetArtifactId) {
      return { success: false, consumed: false, message: "Pick a stash to work on." }
    }

    const artifacts = deps.context.artifacts
    if (!artifacts) {
      return { success: false, consumed: false, message: "Storage is unavailable." }
    }

    const artifact = await artifacts.getPublic(targetArtifactId)
    if (!artifact) {
      return { success: false, consumed: false, message: "That stash is no longer here." }
    }

    const now = Date.now()
    if (!isStashPickable(artifact, now)) {
      return {
        success: false,
        consumed: false,
        message: stashNotPickableMessage(stashUntouchedForMs(artifact, now)),
      }
    }

    const outcome = await resolve({ successChance: options.successChance }, random)

    if (outcome.status === "failed") {
      return {
        success: false,
        consumed: true,
        toastType: "warning",
        title: "The lock holds",
        message: "The pick snapped. Nothing moved, and nobody noticed.",
      }
    }

    if (outcome.status === "deferred") {
      return {
        success: false,
        consumed: true,
        message: outcome.message,
      }
    }

    const grant = await issueStashPickGrant(
      { artifacts, roomId: deps.context.roomId },
      { artifactId: targetArtifactId, userId, source: definition.shortId },
    )
    if (!grant.ok) {
      return { success: false, consumed: false, message: grant.message }
    }

    const [actorName, containerName] = await Promise.all([
      resolveItemUseActorDisplayName(deps, userId),
      resolveContainerDisplayName(deps, artifact),
    ])
    await sendAttributedSystemMessage(
      deps,
      `${actorName.label} picked the lock on ${containerName} in storage.`,
      actorName,
    )

    return {
      success: true,
      consumed: true,
      title: "The lock gives",
      message: "Open Storage and take what you can carry. You have ten minutes.",
    }
  }
}
