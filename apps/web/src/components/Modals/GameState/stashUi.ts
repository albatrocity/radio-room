import type { ItemDefinition, StoredArtifactPublic } from "@repo/types"

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
