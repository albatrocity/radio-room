import type { ItemDefinition, StoredArtifactPublic } from "@repo/types"
import { formatStashUntouchedFor, stashUntouchedForMs } from "@repo/game-logic"

export function formatStashWhen(ms: number): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ms))
  } catch {
    return String(ms)
  }
}

/** Coarse "last opened" duration — shared with server refusal copy (ADR 0185). */
export function formatStashLastTouched(
  a: Pick<StoredArtifactPublic, "storedAt" | "lastTouchedAt">,
  now: number = Date.now(),
): string {
  return formatStashUntouchedFor(stashUntouchedForMs(a, now))
}

/** `containerName` is hydrated at list time; Game State rarely has the definition. */
export function containerDisplayName(
  a: StoredArtifactPublic | undefined,
  definitionMap: Map<string, { name?: string } | ItemDefinition>,
): string | undefined {
  if (!a) return undefined
  const hydrated = a.containerName?.trim()
  if (hydrated) return hydrated
  const def = a.containerDefinitionId ? definitionMap.get(a.containerDefinitionId) : undefined
  return def?.name?.trim() || undefined
}
