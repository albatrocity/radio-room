/**
 * Frontend types for plugin configuration schemas.
 * These mirror the types from @repo/types but without the Zod dependency.
 */

/**
 * Semantic field types for UI hints.
 * These provide hints to the frontend about how to render form fields.
 */
export type PluginFieldType =
  | "boolean" // Checkbox or toggle
  | "string" // Text input
  | "number" // Number input
  | "enum" // Radio group or select
  | "emoji" // Emoji picker
  | "duration" // Duration input (stored in ms, displayed in seconds/minutes)
  | "percentage" // 0-100 with % suffix
  | "color" // Color picker
  | "url" // URL input with validation
  | "string-array" // Array of strings (e.g., list of words)

/** Condition for conditional visibility */
export interface ShowWhenCondition {
  field: string
  value: unknown
}

/**
 * Plugin UI schema element - for text blocks and sections in the form layout
 */
export interface PluginSchemaElement {
  type: "text-block" | "heading"
  /**
   * Content to display. Can be:
   * - A string with template placeholders like {{fieldName}} (simple text)
   * - A CompositeTemplate array (text mixed with components like emoji, username, etc.)
   *
   * String format supports formatters: {{fieldName:formatter}}
   * Available formatters:
   * - duration: converts milliseconds to human-readable (e.g., "60 seconds")
   * - percentage: adds % suffix
   */
  content: string | import("./PluginComponent").CompositeTemplate
  variant?: "info" | "warning" | "example"
  /**
   * Element is only shown when condition(s) are met.
   * If an array is provided, ALL conditions must be true (AND logic).
   */
  showWhen?: ShowWhenCondition | ShowWhenCondition[]
}

/**
 * Field-specific UI metadata not captured in JSON Schema
 */
export interface PluginFieldMeta {
  type: PluginFieldType
  label: string
  description?: string
  placeholder?: string
  /** For duration: display unit (default: seconds) */
  displayUnit?: "seconds" | "minutes"
  /** For duration: storage unit (default: milliseconds) */
  storageUnit?: "milliseconds" | "seconds"
  /**
   * Field is only shown when condition(s) are met.
   * If an array is provided, ALL conditions must be true (AND logic).
   */
  showWhen?: ShowWhenCondition | ShowWhenCondition[]
  /** For enum types: custom labels for each option */
  enumLabels?: Record<string, string>
}

/**
 * Plugin configuration schema definition.
 * Contains JSON Schema for validation and UI metadata for form generation.
 */
export interface PluginConfigSchema {
  /** JSON Schema generated from Zod via z.toJSONSchema() */
  jsonSchema: Record<string, unknown>
  /** UI layout - field order and text blocks */
  layout: (string | PluginSchemaElement)[]
  /** Field-specific UI hints not captured in JSON Schema */
  fieldMeta: Record<string, PluginFieldMeta>
}

import type { PluginComponentSchema } from "./PluginComponent"

/**
 * Response structure for plugin schema API endpoint
 */
export interface PluginSchemaInfo {
  name: string
  version: string
  description?: string
  defaultConfig?: Record<string, unknown>
  configSchema?: PluginConfigSchema
  componentSchema?: PluginComponentSchema
}

/**
 * Response from GET /api/plugins
 */
export interface PluginSchemasResponse {
  plugins: PluginSchemaInfo[]
}
