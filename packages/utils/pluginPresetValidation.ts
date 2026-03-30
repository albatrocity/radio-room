import type { PluginPreset, PresetValidationResult } from "@repo/types"

export type { PresetValidationResult }

/**
 * Validates that a parsed JSON object matches the PluginPreset schema.
 */
export function validatePreset(data: unknown): PresetValidationResult {
  if (!data || typeof data !== "object") {
    return { valid: false, error: "Invalid preset: expected an object" }
  }

  const obj = data as Record<string, unknown>

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
