/**
 * Plugin utilities for condition checking and prop interpolation.
 * Used by both server-side rendering and frontend frameworks.
 */

import type { ShowWhenCondition } from "@repo/types"
import { interpolateTemplate } from "./templateInterpolation"

export type { ShowWhenCondition }

// ============================================================================
// Condition Checking
// ============================================================================

export type ShowWhenViewerContext = Record<string, unknown>

/**
 * Resolve a showWhen field / membership path against config, store, item, and viewer.
 *
 * Prefixes:
 * - `item.*` — item context
 * - `viewer.*` — viewing user context
 * - bare name — config, then store
 */
export function resolveShowWhenPath(
  path: string,
  config: Record<string, unknown>,
  store: Record<string, unknown>,
  itemContext?: Record<string, unknown>,
  viewerContext?: ShowWhenViewerContext,
): unknown {
  if (path.startsWith("item.")) {
    return itemContext?.[path.slice(5)]
  }
  if (path.startsWith("viewer.")) {
    return viewerContext?.[path.slice(7)]
  }
  return config[path] ?? store[path]
}

/**
 * Check if a single showWhen condition is met.
 *
 * @example
 * ```typescript
 * checkShowWhenCondition(
 *   { field: "enabled", value: true },
 *   { enabled: true },
 *   {}
 * ) // → true
 *
 * checkShowWhenCondition(
 *   { field: "eligibleUserIds", includes: "viewer.userId" },
 *   {},
 *   { eligibleUserIds: ["u1"] },
 *   undefined,
 *   { userId: "u1" }
 * ) // → true
 * ```
 */
export function checkShowWhenCondition(
  condition: ShowWhenCondition,
  config: Record<string, unknown>,
  store: Record<string, unknown>,
  itemContext?: Record<string, unknown>,
  viewerContext?: ShowWhenViewerContext,
): boolean {
  const actualValue = resolveShowWhenPath(
    condition.field,
    config,
    store,
    itemContext,
    viewerContext,
  )

  if (condition.includes !== undefined) {
    const member = resolveShowWhenPath(
      condition.includes,
      config,
      store,
      itemContext,
      viewerContext,
    )
    return Array.isArray(actualValue) && actualValue.includes(member)
  }

  if (condition.notIncludes !== undefined) {
    const member = resolveShowWhenPath(
      condition.notIncludes,
      config,
      store,
      itemContext,
      viewerContext,
    )
    return Array.isArray(actualValue) && !actualValue.includes(member)
  }

  return actualValue === condition.value
}

/**
 * Check if all showWhen conditions are met (AND logic).
 */
export function checkShowWhenConditions(
  conditions: ShowWhenCondition | ShowWhenCondition[],
  config: Record<string, unknown>,
  store: Record<string, unknown>,
  itemContext?: Record<string, unknown>,
  viewerContext?: ShowWhenViewerContext,
): boolean {
  const conditionsArray = Array.isArray(conditions) ? conditions : [conditions]
  return conditionsArray.every((condition) =>
    checkShowWhenCondition(condition, config, store, itemContext, viewerContext),
  )
}

// ============================================================================
// Prop Interpolation
// ============================================================================

/**
 * Recursively interpolate template placeholders in an object's properties.
 * Handles nested objects and arrays. Useful for interpolating config and
 * store values in component props at render time.
 *
 * The caller is responsible for structuring the `values` object to match
 * the placeholder paths used in templates. For example, to support
 * `{{config.fieldName}}` placeholders, pass `{ config: {...} }`. Store
 * values can be placed at the top level for `{{storeKey}}` references.
 *
 * @param props - Object with properties to interpolate
 * @param values - Values to use for interpolation (supports nested paths)
 * @returns New object with interpolated values
 */
export function interpolatePropsRecursively(
  props: Record<string, unknown>,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const interpolated: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string") {
      interpolated[key] = interpolateTemplate(value, values)
    } else if (Array.isArray(value)) {
      interpolated[key] = value.map((item) => {
        if (typeof item === "object" && item !== null) {
          return interpolatePropsRecursively(item as Record<string, unknown>, values)
        }
        return item
      })
    } else if (typeof value === "object" && value !== null) {
      interpolated[key] = interpolatePropsRecursively(value as Record<string, unknown>, values)
    } else {
      interpolated[key] = value
    }
  }

  return interpolated
}
