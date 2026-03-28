export interface PluginPreset {
  presetName: string
  exportedAt: string
  version: 1
  pluginConfigs: Record<string, Record<string, unknown>>
}

export interface PresetValidationResult {
  valid: boolean
  error?: string
  preset?: PluginPreset
}
