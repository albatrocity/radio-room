/**
 * Template interpolation utilities for plugin configuration.
 * Used to render dynamic content in plugin schema text blocks and component templates.
 */

import type { CompositeTemplate } from "@repo/types"

/**
 * Format a value using a formatter name.
 *
 * Available formatters:
 * - `duration`: Converts milliseconds to human-readable (e.g., "60 seconds", "2 minutes")
 * - `percentage`: Adds % suffix (e.g., "50%")
 *
 * @param value - The value to format
 * @param formatter - The formatter name
 * @returns The formatted string
 */
export function formatValue(value: unknown, formatter: string): string {
  switch (formatter) {
    case "duration":
      // Assume value is in milliseconds, convert to human-readable
      if (typeof value === "number") {
        const seconds = value / 1000
        if (seconds >= 60) {
          const minutes = Math.floor(seconds / 60)
          const remainingSeconds = seconds % 60
          if (remainingSeconds === 0) {
            return `${minutes} minute${minutes !== 1 ? "s" : ""}`
          }
          return `${minutes}m ${remainingSeconds}s`
        }
        return `${seconds} second${seconds !== 1 ? "s" : ""}`
      }
      return String(value)
    case "percentage":
      return `${value}%`
    default:
      return String(value)
  }
}

/**
 * Interpolate template placeholders in a content string.
 * Supports `{{fieldName}}` and `{{fieldName:formatter}}` syntax.
 *
 * @example
 * ```typescript
 * // Simple interpolation
 * interpolateTemplate("Threshold is {{thresholdValue}}", { thresholdValue: 50 })
 * // → "Threshold is 50"
 *
 * // With formatter
 * interpolateTemplate("Time limit: {{timeLimit:duration}}", { timeLimit: 60000 })
 * // → "Time limit: 60 seconds"
 *
 * // With percentage formatter
 * interpolateTemplate("At {{thresholdValue:percentage}}", { thresholdValue: 50 })
 * // → "At 50%"
 *
 * // Missing value keeps placeholder
 * interpolateTemplate("Value: {{missing}}", {})
 * // → "Value: {{missing}}"
 * ```
 *
 * @param content - The template string with placeholders
 * @param values - Object containing values to interpolate
 * @returns The interpolated string
 */
export function interpolateTemplate(content: string, values: Record<string, unknown>): string {
  return content.replace(/\{\{(\w+)(?::(\w+))?\}\}/g, (match, fieldName, formatter) => {
    const value = values[fieldName]
    if (value === undefined || value === null) {
      return match // Keep placeholder if value not found
    }
    if (formatter) {
      return formatValue(value, formatter)
    }
    return String(value)
  })
}

/**
 * Interpolate variables in a composite template's props and content.
 * Returns a new template with all {{placeholder}} values resolved.
 *
 * @example
 * ```typescript
 * const template: CompositeTemplate = [
 *   { type: "component", name: "username", props: { userId: "{{value}}" } },
 *   { type: "text", content: ": {{score}} words" }
 * ]
 *
 * const interpolated = interpolateCompositeTemplate(template, {
 *   value: "user-123",
 *   score: 42
 * })
 * // Returns:
 * // [
 * //   { type: "component", name: "username", props: { userId: "user-123" } },
 * //   { type: "text", content: ": 42 words" }
 * // ]
 * ```
 *
 * @param template - The composite template with placeholders
 * @param values - Object containing values to interpolate
 * @returns A new template with interpolated values
 */
export function interpolateCompositeTemplate(
  template: CompositeTemplate,
  values: Record<string, unknown>,
): CompositeTemplate {
  return template.map((part) => {
    if (part.type === "text") {
      return {
        type: "text",
        content: interpolateTemplate(part.content, values),
      }
    } else if (part.type === "component") {
      // Interpolate each prop value
      const interpolatedProps: Record<string, string> = {}
      for (const [key, value] of Object.entries(part.props)) {
        interpolatedProps[key] = interpolateTemplate(value, values)
      }
      return {
        type: "component",
        name: part.name,
        props: interpolatedProps,
      }
    }
    return part
  })
}
