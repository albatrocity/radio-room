/**
 * Plugin utilities for condition checking and prop interpolation.
 * Used by both server-side rendering and frontend frameworks.
 */

import { interpolateTemplate } from "./templateInterpolation"

// ============================================================================
// Condition Checking
// ============================================================================

/**
 * A showWhen condition specifying when an element should be visible.
 */
export interface ShowWhenCondition {
  field: string
  value: unknown
}

/**
 * Check if a single showWhen condition is met.
 * Checks config first, then store/context values, then item context.
 *
 * Field prefixes:
 * - `item.field` - Check the item context (e.g., per-user data)
 * - `field` - Check config, then store
 *
 * @example
 * ```typescript
 * // Single condition
 * checkShowWhenCondition(
 *   { field: "enabled", value: true },
 *   { enabled: true },  // config
 *   {}                  // store
 * ) // → true
 *
 * // Check store when not in config
 * checkShowWhenCondition(
 *   { field: "showCountdown", value: true },
 *   {},                       // config
 *   { showCountdown: true }   // store
 * ) // → true
 *
 * // Check item context (e.g., user data)
 * checkShowWhenCondition(
 *   { field: "item.isDeputyDj", value: true },
 *   {},                       // config
 *   {},                       // store
 *   { isDeputyDj: true }      // itemContext
 * ) // → true
 * ```
 *
 * @param condition - The condition to check
 * @param config - Plugin configuration values
 * @param store - Plugin component store values
 * @param itemContext - Optional item-level context (e.g., user data for userListItem)
 * @returns Whether the condition is met
 */
export function checkShowWhenCondition(
  condition: ShowWhenCondition,
  config: Record<string, unknown>,
  store: Record<string, unknown>,
  itemContext?: Record<string, unknown>,
): boolean {
  // Handle item.field syntax for item context
  if (condition.field.startsWith("item.")) {
    const itemField = condition.field.slice(5) // Remove "item." prefix
    const actualValue = itemContext?.[itemField]
    return actualValue === condition.value
  }

  const actualValue = config[condition.field] ?? store[condition.field]
  return actualValue === condition.value
}

/**
 * Check if all showWhen conditions are met (AND logic).
 *
 * @example
 * ```typescript
 * // Multiple conditions (all must be true)
 * checkShowWhenConditions(
 *   [
 *     { field: "enabled", value: true },
 *     { field: "thresholdType", value: "percentage" }
 *   ],
 *   { enabled: true, thresholdType: "percentage" },
 *   {}
 * ) // → true
 *
 * // With item context
 * checkShowWhenConditions(
 *   [
 *     { field: "competitiveModeEnabled", value: true },
 *     { field: "item.isDeputyDj", value: true }
 *   ],
 *   { competitiveModeEnabled: true },
 *   {},
 *   { isDeputyDj: true }
 * ) // → true
 * ```
 *
 * @param conditions - Single condition or array of conditions
 * @param config - Plugin configuration values
 * @param store - Plugin component store values
 * @param itemContext - Optional item-level context
 * @returns Whether all conditions are met
 */
export function checkShowWhenConditions(
  conditions: ShowWhenCondition | ShowWhenCondition[],
  config: Record<string, unknown>,
  store: Record<string, unknown>,
  itemContext?: Record<string, unknown>,
): boolean {
  const conditionsArray = Array.isArray(conditions) ? conditions : [conditions]
  return conditionsArray.every((condition) =>
    checkShowWhenCondition(condition, config, store, itemContext),
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
 * @example
 * ```typescript
 * // Config values nested under "config" key
 * interpolatePropsRecursively(
 *   { label: "React with {{config.reactionType}}" },
 *   { config: { reactionType: "+1" } }
 * )
 * // → { label: "React with +1" }
 *
 * // Mixed: top-level store values + nested config
 * interpolatePropsRecursively(
 *   { label: "Sell ({{sellPrice}} coins, base {{config.basePrice}})" },
 *   { sellPrice: 50, config: { basePrice: 100 } }
 * )
 * // → { label: "Sell (50 coins, base 100)" }
 *
 * // Arrays (e.g., CompositeTemplate)
 * interpolatePropsRecursively(
 *   {
 *     content: [
 *       { type: "text", content: "Value: {{config.value}}" }
 *     ]
 *   },
 *   { config: { value: 42 } }
 * )
 * // → { content: [{ type: "text", content: "Value: 42" }] }
 * ```
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
