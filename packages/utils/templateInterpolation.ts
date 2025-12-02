/**
 * Template interpolation utilities for plugin configuration.
 * Used to render dynamic content in plugin schema text blocks and component templates.
 */

import type { CompositeTemplate } from "@repo/types"

/**
 * Simple English pluralization rules.
 * Returns the plural form of a word based on count.
 *
 * @param word - The singular word to pluralize
 * @param count - The count to determine if plural is needed
 * @returns The correctly pluralized word
 */
function pluralize(word: string, count: number): string {
  // If count is 1, return singular
  if (count === 1) {
    return word
  }

  // Handle special cases
  const lower = word.toLowerCase()
  
  // Words ending in 'y' preceded by consonant -> 'ies'
  if (lower.match(/[^aeiou]y$/)) {
    return word.slice(0, -1) + "ies"
  }
  
  // Words ending in 's', 'ss', 'sh', 'ch', 'x', 'z' -> 'es'
  if (lower.match(/(s|ss|sh|ch|x|z)$/)) {
    return word + "es"
  }
  
  // Words ending in 'f' or 'fe' -> 'ves'
  if (lower.endsWith("f")) {
    return word.slice(0, -1) + "ves"
  }
  if (lower.endsWith("fe")) {
    return word.slice(0, -2) + "ves"
  }
  
  // Default: just add 's'
  return word + "s"
}

/**
 * Format a value using a formatter name.
 *
 * Available formatters:
 * - `duration`: Converts milliseconds to human-readable (e.g., "60 seconds", "2 minutes")
 * - `percentage`: Adds % suffix (e.g., "50%")
 * - `pluralize:countField`: Pluralizes the value based on another field's count
 *
 * @param value - The value to format
 * @param formatter - The formatter name
 * @param formatterArg - Optional argument for the formatter (e.g., count field for pluralize)
 * @param allValues - All available values for looking up formatter arguments
 * @returns The formatted string
 */
export function formatValue(
  value: unknown,
  formatter: string,
  formatterArg?: string,
  allValues?: Record<string, unknown>,
): string {
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
    case "pluralize":
      // Pluralize the value based on a count (field name or literal number)
      if (typeof value === "string" && formatterArg) {
        let count: number | undefined
        
        // Check if formatterArg is a literal number
        const literalNumber = Number(formatterArg)
        if (!isNaN(literalNumber)) {
          count = literalNumber
        } else if (allValues) {
          // Try to resolve as a field name (supports nested paths like "config.fieldName")
          count = allValues[formatterArg] as number
          if (formatterArg.includes(".")) {
            const parts = formatterArg.split(".")
            let current: any = allValues
            for (const part of parts) {
              current = current?.[part]
            }
            count = current
          }
        }
        
        if (typeof count === "number") {
          return pluralize(value, count)
        }
      }
      return String(value)
    default:
      return String(value)
  }
}

/**
 * Interpolate template placeholders in a content string.
 * Supports:
 * - `{{fieldName}}` - Simple interpolation
 * - `{{fieldName:formatter}}` - With formatter
 * - `{{fieldName:formatter:arg}}` - Formatter with argument
 * - Supports nested paths like `config.fieldName`
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
 * // With pluralize formatter (field reference)
 * interpolateTemplate("{{word:pluralize:count}}", { word: "word", count: 5 })
 * // → "words"
 *
 * // With pluralize formatter (literal number)
 * interpolateTemplate("{{word:pluralize:2}}", { word: "category" })
 * // → "categories"
 *
 * // With nested config access and pluralize
 * interpolateTemplate("{{config.wordLabel:pluralize:score}}", { config: { wordLabel: "emoji" }, score: 42 })
 * // → "emojis"
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
  // Updated regex to support nested paths (config.fieldName) and optional formatter argument
  return content.replace(/\{\{([\w.]+)(?::(\w+)(?::(\w+))?)?\}\}/g, (match, fieldPath, formatter, formatterArg) => {
    // Support nested paths like "config.fieldName"
    let value = values[fieldPath]
    if (fieldPath.includes(".")) {
      const parts = fieldPath.split(".")
      let current: any = values
      for (const part of parts) {
        current = current?.[part]
        if (current === undefined || current === null) {
          return match // Keep placeholder if path not found
        }
      }
      value = current
    }
    
    if (value === undefined || value === null) {
      return match // Keep placeholder if value not found
    }
    
    if (formatter) {
      return formatValue(value, formatter, formatterArg, values)
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
