import type { ItemDefinition } from "@repo/types"

/** Extra payload fields collected before `USE_INVENTORY_ITEM`. */
export type InventoryUseExtra = {
  targetUserId?: string
  targetQueueItemId?: string
  targetArtifactId?: string
  targetInventoryItemId?: string
  targetInventoryItemIds?: string[]
  formValues?: Record<string, string | number>
}

/** True when the definition declares at least one `useForm` field. */
export function hasItemUseForm(definition?: ItemDefinition): boolean {
  return (definition?.useForm?.length ?? 0) > 0
}

/**
 * Entity pickers that collect a live-room target before use.
 * `"self"` needs no picker. Authored values use `useForm` (ADR 0187 / 0193).
 */
const ENTITY_TARGET_KINDS = new Set<NonNullable<ItemDefinition["requiresTarget"]>>([
  "user",
  "queueItem",
  "inventoryItems",
  "userInventoryItem",
  "mediaItem",
  "storedArtifact",
])

/**
 * When both an entity `requiresTarget` and `useForm` are set, the UI runs the
 * picker first, then the form, and sends both on use (ADR 0193).
 */
export function shouldPickTargetThenForm(
  requiresTarget: ItemDefinition["requiresTarget"] | undefined,
  definition?: ItemDefinition,
): boolean {
  if (!hasItemUseForm(definition)) return false
  if (requiresTarget == null) return false
  return ENTITY_TARGET_KINDS.has(requiresTarget)
}

/** Merge a completed target pick with collected `useForm` values. */
export function mergeTargetAndFormValues(
  target: InventoryUseExtra,
  formValues: Record<string, string | number>,
): InventoryUseExtra {
  return { ...target, formValues }
}

export type TargetThenFormPhase = "pick" | "form"

/**
 * Two-step item-use flow: entity picker → declarative form.
 * Pure transitions so the sequence can be unit-tested without a DOM.
 */
export function advanceTargetThenForm(
  phase: TargetThenFormPhase,
  event: { type: "TARGET_PICKED" } | { type: "FORM_CLOSED" } | { type: "FORM_CONFIRMED" },
): TargetThenFormPhase {
  switch (event.type) {
    case "TARGET_PICKED":
      return phase === "pick" ? "form" : phase
    case "FORM_CLOSED":
    case "FORM_CONFIRMED":
      return "pick"
    default:
      return phase
  }
}
