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
 * Checks config first, then store/context values.
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
 * ```
 *
 * @param condition - The condition to check
 * @param config - Plugin configuration values
 * @param store - Plugin component store values
 * @returns Whether the condition is met
 */
export function checkShowWhenCondition(
  condition: ShowWhenCondition,
  config: Record<string, unknown>,
  store: Record<string, unknown>,
): boolean {
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
 * ```
 *
 * @param conditions - Single condition or array of conditions
 * @param config - Plugin configuration values
 * @param store - Plugin component store values
 * @returns Whether all conditions are met
 */
export function checkShowWhenConditions(
  conditions: ShowWhenCondition | ShowWhenCondition[],
  config: Record<string, unknown>,
  store: Record<string, unknown>,
): boolean {
  const conditionsArray = Array.isArray(conditions) ? conditions : [conditions]
  return conditionsArray.every((condition) => checkShowWhenCondition(condition, config, store))
}

// ============================================================================
// Prop Interpolation
// ============================================================================

/**
 * Recursively interpolate template placeholders in an object's properties.
 * Handles nested objects and arrays. Useful for interpolating config values
 * in component props at render time.
 *
 * @example
 * ```typescript
 * // Simple string interpolation
 * interpolatePropsRecursively(
 *   { label: "React with {{config.reactionType}}" },
 *   { reactionType: "+1" }
 * )
 * // → { label: "React with +1" }
 *
 * // Nested objects
 * interpolatePropsRecursively(
 *   { style: { color: "{{config.color}}" } },
 *   { color: "red" }
 * )
 * // → { style: { color: "red" } }
 *
 * // Arrays (e.g., CompositeTemplate)
 * interpolatePropsRecursively(
 *   {
 *     content: [
 *       { type: "text", content: "Value: {{config.value}}" }
 *     ]
 *   },
 *   { value: 42 }
 * )
 * // → { content: [{ type: "text", content: "Value: 42" }] }
 * ```
 *
 * @param props - Object with properties to interpolate
 * @param config - Configuration values to use for interpolation
 * @returns New object with interpolated values
 */
export function interpolatePropsRecursively(
  props: Record<string, unknown>,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const interpolated: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props)) {
    if (typeof value === "string") {
      // Wrap config in a "config" key for proper path resolution
      interpolated[key] = interpolateTemplate(value, { config })
    } else if (Array.isArray(value)) {
      // Handle arrays (e.g., CompositeTemplate)
      interpolated[key] = value.map((item) => {
        if (typeof item === "object" && item !== null) {
          return interpolatePropsRecursively(item as Record<string, unknown>, config)
        }
        return item
      })
    } else if (typeof value === "object" && value !== null) {
      // Recursively interpolate nested objects
      interpolated[key] = interpolatePropsRecursively(value as Record<string, unknown>, config)
    } else {
      interpolated[key] = value
    }
  }

  return interpolated
}

