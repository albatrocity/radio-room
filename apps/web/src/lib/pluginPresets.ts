/**
 * Plugin Presets - Export/Import utilities for plugin configurations
 *
 * Allows room admins to save their plugin configurations as JSON files
 * and restore them later or apply them to different rooms.
 */

import type { PluginPreset, PresetValidationResult } from "@repo/types"
import { validatePreset } from "@repo/utils"

export type { PluginPreset, PresetValidationResult }
export { validatePreset }

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
