/**
 * Plugin Presets - Export/Import utilities for plugin configurations
 *
 * Allows room admins to save their plugin configurations as JSON files
 * and restore them later or apply them to different rooms.
 */

// ============================================================================
// Types
// ============================================================================

export interface PluginPreset {
  /** User-provided name for the preset */
  presetName: string
  /** ISO timestamp when the preset was exported */
  exportedAt: string
  /** Schema version for forward compatibility */
  version: 1
  /** Plugin configurations keyed by plugin name */
  pluginConfigs: Record<string, Record<string, unknown>>
}

export interface PresetValidationResult {
  valid: boolean
  error?: string
  preset?: PluginPreset
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validates that a parsed JSON object matches the PluginPreset schema.
 */
export function validatePreset(data: unknown): PresetValidationResult {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Invalid preset: expected an object" }
  }

  const obj = data as Record<string, unknown>

  // Check required fields
  if (typeof obj.presetName !== "string") {
    return { valid: false, error: "Invalid preset: missing or invalid presetName" }
  }

  if (typeof obj.exportedAt !== "string") {
    return { valid: false, error: "Invalid preset: missing or invalid exportedAt" }
  }

  if (obj.version !== 1) {
    return { valid: false, error: "Invalid preset: unsupported version" }
  }

  if (!obj.pluginConfigs || typeof obj.pluginConfigs !== "object") {
    return { valid: false, error: "Invalid preset: missing or invalid pluginConfigs" }
  }

  // Validate pluginConfigs structure
  const pluginConfigs = obj.pluginConfigs as Record<string, unknown>
  for (const [pluginName, config] of Object.entries(pluginConfigs)) {
    if (!config || typeof config !== "object") {
      return {
        valid: false,
        error: `Invalid preset: pluginConfigs.${pluginName} must be an object`,
      }
    }
  }

  return {
    valid: true,
    preset: {
      presetName: obj.presetName as string,
      exportedAt: obj.exportedAt as string,
      version: 1,
      pluginConfigs: pluginConfigs as Record<string, Record<string, unknown>>,
    },
  }
}

// ============================================================================
// Export
// ============================================================================

/**
 * Exports the current plugin configurations as a downloadable JSON file.
 *
 * @param pluginConfigs - The current plugin configurations from settings
 * @param presetName - User-provided name for the preset (defaults to "Plugin Preset")
 */
export function exportPreset(
  pluginConfigs: Record<string, Record<string, unknown>>,
  presetName: string = "Plugin Preset",
): void {
  const preset: PluginPreset = {
    presetName,
    exportedAt: new Date().toISOString(),
    version: 1,
    pluginConfigs,
  }

  const json = JSON.stringify(preset, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)

  // Create a sanitized filename from the preset name
  const safeFilename = presetName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")

  const filename = `${safeFilename || "preset"}.json`

  // Trigger download
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)

  // Cleanup
  URL.revokeObjectURL(url)
}

// ============================================================================
// Import
// ============================================================================

/**
 * Reads and validates a preset file.
 *
 * @param file - The File object from a file input
 * @returns Promise resolving to validation result with parsed preset
 */
export async function importPreset(file: File): Promise<PresetValidationResult> {
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    return validatePreset(data)
  } catch (error) {
    if (error instanceof SyntaxError) {
      return { valid: false, error: "Invalid JSON file" }
    }
    return { valid: false, error: "Failed to read file" }
  }
}
