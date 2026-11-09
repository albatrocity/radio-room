import type { SiteNarrativeVariant, TripCondition } from "./schema"

/**
 * Conditions on site behavior (ADR 0230). The evaluator never reads trip state
 * directly: it asks a `ConditionFacts`, which the runtime builds from state and
 * Game Studio builds from its simulator. A new fact source is one leaf in
 * `tripConditionSchema`, one method here, and one lint rule.
 */
export interface ConditionFacts {
  /** The van holds this key item (`map.keyItems` id). */
  hasKey(id: string): boolean
}

/** Facts from the key ids the van holds. */
export function keyItemFacts(held: Iterable<string>): ConditionFacts {
  const keys = new Set(held)
  return { hasKey: (id) => keys.has(id) }
}

/** Facts for a van holding nothing. */
export const NO_CONDITION_FACTS: ConditionFacts = { hasKey: () => false }

export function evaluateCondition(condition: TripCondition, facts: ConditionFacts): boolean {
  if ("has" in condition) return facts.hasKey(condition.has)
  if ("not" in condition) return !evaluateCondition(condition.not, facts)
  if ("all" in condition) return condition.all.every((c) => evaluateCondition(c, facts))
  return condition.any.some((c) => evaluateCondition(c, facts))
}

/** An optional `when`: absent always holds. */
export function conditionHolds(when: TripCondition | undefined, facts: ConditionFacts): boolean {
  return when === undefined || evaluateCondition(when, facts)
}

/** Every key id a condition reads, in first-seen order. */
export function conditionKeys(condition: TripCondition): string[] {
  const keys = new Set<string>()
  const walk = (c: TripCondition) => {
    if ("has" in c) keys.add(c.has)
    else if ("not" in c) walk(c.not)
    else if ("all" in c) c.all.forEach(walk)
    else c.any.forEach(walk)
  }
  walk(condition)
  return Array.from(keys)
}

/** The entries whose `when` holds (or that have none), in order. */
export function filterByCondition<T extends { when?: TripCondition }>(
  list: readonly T[],
  facts: ConditionFacts,
): T[] {
  return list.filter((entry) => conditionHolds(entry.when, facts))
}

export type ResolvedNarrative<V extends string = SiteNarrativeVariant> = {
  text: string
  variant?: V
}

/** The index of the first case whose `when` holds, or undefined when none does (ADR 0230). */
export function narrativeCaseIndex(
  cases: readonly { when: TripCondition }[] | undefined,
  facts: ConditionFacts,
): number | undefined {
  const index = (cases ?? []).findIndex((entry) => evaluateCondition(entry.when, facts))
  return index >= 0 ? index : undefined
}

/**
 * The narrative for a chosen case: case `index` replaces the fallback (a case
 * without a variant keeps the fallback's); no case means the fallback itself;
 * no text means nothing. The runtime records the index when the narrative
 * posts, so the Trip tab and the export replay the same text later.
 */
export function narrativeForCase<V extends string = SiteNarrativeVariant>(
  cases: readonly { text: string; variant?: V }[] | undefined,
  fallback: { text?: string; variant?: V },
  index: number | undefined,
): ResolvedNarrative<V> | undefined {
  const match = index === undefined ? undefined : cases?.[index]
  const text = match?.text ?? fallback.text
  if (!text) return undefined
  const variant = match?.variant ?? fallback.variant
  return variant !== undefined ? { text, variant } : { text }
}

/**
 * The narrative to post: the first case whose `when` holds replaces the
 * fallback (a case without a variant keeps the fallback's), else the fallback
 * itself, else nothing.
 */
export function pickNarrativeCase<V extends string = SiteNarrativeVariant>(
  cases: readonly { when: TripCondition; text: string; variant?: V }[] | undefined,
  fallback: { text?: string; variant?: V },
  facts: ConditionFacts,
): ResolvedNarrative<V> | undefined {
  return narrativeForCase(cases, fallback, narrativeCaseIndex(cases, facts))
}

/** "van has Overlook Ticket Stub", for the Flow panel and lint copy. */
export function describeCondition(
  condition: TripCondition,
  keyName: (id: string) => string = (id) => id,
): string {
  if ("has" in condition) return `van has ${keyName(condition.has)}`
  if ("not" in condition) {
    const inner = condition.not
    return "has" in inner
      ? `van lacks ${keyName(inner.has)}`
      : `not (${describeCondition(inner, keyName)})`
  }
  const parts = ("all" in condition ? condition.all : condition.any).map((c) =>
    "has" in c ? describeCondition(c, keyName) : `(${describeCondition(c, keyName)})`,
  )
  if (parts.length === 1) return parts[0]!
  return parts.join("all" in condition ? " and " : " or ")
}
