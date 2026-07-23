import { useMemo } from "react"
import { Box, HStack, Spinner, Text, VStack } from "@chakra-ui/react"
import { PluginConfigForm } from "@repo/plugin-config-ui"
import type {
  ConfigImportMode,
  PluginConfigSchema,
  PluginPreset,
  PluginSchemaInfo,
  SegmentPrivatePluginContent,
} from "@repo/types"
import { usePluginSchemas } from "../../hooks/usePluginSchemas"
import { previewPluginConfigImport } from "../../lib/api"
import { toaster } from "../ui/toaster"

const PRESET_DEFAULT_NAME = "Segment plugin preset"

type ConfigurablePlugin = PluginSchemaInfo & { configSchema: PluginConfigSchema }

export interface SegmentPluginConfigValue {
  pluginPreset: PluginPreset | null
  privatePluginContent: SegmentPrivatePluginContent | null
}

interface SegmentPluginConfigEditorProps {
  pluginPreset: PluginPreset | null
  privatePluginContent: SegmentPrivatePluginContent | null
  onChange: (next: SegmentPluginConfigValue) => void
}

/** A field is server-only when its schema meta declares `scope: "private"` (ADR 0068). */
function isPrivateField(schema: PluginConfigSchema, field: string): boolean {
  const meta = schema.fieldMeta?.[field] as { scope?: string } | undefined
  return meta?.scope === "private"
}

/** Split a plugin's default config into public (→ preset) and private (→ segment private content) halves. */
function splitDefaultsByScope(info: ConfigurablePlugin): {
  publicDefaults: Record<string, unknown>
  privateDefaults: Record<string, unknown>
} {
  const publicDefaults: Record<string, unknown> = {}
  const privateDefaults: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(info.defaultConfig ?? {})) {
    if (isPrivateField(info.configSchema, key)) privateDefaults[key] = value
    else publicDefaults[key] = value
  }
  return { publicDefaults, privateDefaults }
}

/** Wrap the public plugin configs in a valid `PluginPreset`, preserving prior metadata. */
function buildPreset(
  prev: PluginPreset | null,
  pluginConfigs: Record<string, Record<string, unknown>>,
): PluginPreset | null {
  if (Object.keys(pluginConfigs).length === 0) return null
  return {
    presetName: prev?.presetName?.trim() || PRESET_DEFAULT_NAME,
    exportedAt: prev?.exportedAt || new Date().toISOString(),
    version: 1,
    pluginConfigs,
  }
}

/** Drop empty per-plugin buckets; collapse to `null` when nothing private remains. */
function normalizePrivate(content: SegmentPrivatePluginContent): SegmentPrivatePluginContent | null {
  const cleaned: SegmentPrivatePluginContent = {}
  for (const [name, fields] of Object.entries(content)) {
    if (fields && Object.keys(fields).length > 0) cleaned[name] = fields
  }
  return Object.keys(cleaned).length === 0 ? null : cleaned
}

/**
 * Schema-driven authoring for a segment's plugin config (ADR 0068 §4). Renders
 * each plugin's config schema via the shared `@repo/plugin-config-ui` renderer and
 * routes each edited field by its declared scope: public fields into the segment's
 * `pluginPreset` (broadcast on activation), private fields into `privatePluginContent`
 * (server-only). Coexists with the raw-JSON preset importer — both bind to the same
 * `pluginPreset` form state, so neither clobbers the other.
 *
 * Live session actions (e.g. quiz "Start quiz") are skipped. `configImport` actions
 * use a dry-run API (ADR 0075) so paste parsers stay in the plugin package.
 */
export function SegmentPluginConfigEditor({
  pluginPreset,
  privatePluginContent,
  onChange,
}: SegmentPluginConfigEditorProps) {
  const { data: schemas, isLoading, isError } = usePluginSchemas()

  const configurablePlugins = useMemo(
    () =>
      (schemas ?? []).filter((p): p is ConfigurablePlugin => !!p.configSchema),
    [schemas],
  )

  const publicConfigs = pluginPreset?.pluginConfigs ?? {}
  const privateConfigs = privatePluginContent ?? {}

  function emit(
    nextPublic: Record<string, Record<string, unknown>>,
    nextPrivate: SegmentPrivatePluginContent,
  ) {
    onChange({
      pluginPreset: buildPreset(pluginPreset, nextPublic),
      privatePluginContent: normalizePrivate(nextPrivate),
    })
  }

  function setIncluded(info: ConfigurablePlugin, include: boolean) {
    const nextPublic = { ...publicConfigs }
    const nextPrivate = { ...privateConfigs }
    if (include) {
      const { publicDefaults, privateDefaults } = splitDefaultsByScope(info)
      nextPublic[info.name] = { ...publicDefaults }
      if (Object.keys(privateDefaults).length > 0) nextPrivate[info.name] = { ...privateDefaults }
    } else {
      delete nextPublic[info.name]
      delete nextPrivate[info.name]
    }
    emit(nextPublic, nextPrivate)
  }

  function handleFieldChange(info: ConfigurablePlugin, field: string, value: unknown) {
    const nextPublic = { ...publicConfigs }
    const nextPrivate = { ...privateConfigs }
    if (isPrivateField(info.configSchema, field)) {
      nextPrivate[info.name] = { ...(nextPrivate[info.name] ?? {}), [field]: value }
    } else {
      nextPublic[info.name] = { ...(nextPublic[info.name] ?? {}), [field]: value }
    }
    emit(nextPublic, nextPrivate)
  }

  return (
    <Box>
      <Box mb={1} fontSize="sm" fontWeight="medium">
        Plugin configuration
      </Box>
      <Text fontSize="xs" color="fg.muted" mb={3}>
        Configure plugins for this segment. Public settings apply to the room on activation; private
        content (e.g. quiz answers) is stored server-side and never sent to guests.
      </Text>

      {isLoading ? (
        <HStack>
          <Spinner size="sm" />
          <Text fontSize="sm">Loading plugins…</Text>
        </HStack>
      ) : isError ? (
        <Text fontSize="sm" color="red.500">
          Failed to load plugin schemas.
        </Text>
      ) : configurablePlugins.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          No configurable plugins available.
        </Text>
      ) : (
        <VStack gap={3} align="stretch">
          {configurablePlugins.map((info) => {
            const included = info.name in publicConfigs || info.name in privateConfigs
            const { publicDefaults, privateDefaults } = splitDefaultsByScope(info)
            const displayValues = {
              ...publicDefaults,
              ...privateDefaults,
              ...(publicConfigs[info.name] ?? {}),
              ...(privateConfigs[info.name] ?? {}),
            }
            return (
              <Box
                key={info.name}
                borderWidth="1px"
                borderColor="border.muted"
                borderRadius="md"
                p={3}
              >
                <HStack as="label" gap={2} mb={included ? 3 : 0} cursor="pointer" align="start">
                  <input
                    type="checkbox"
                    checked={included}
                    onChange={(e) => setIncluded(info, e.target.checked)}
                  />
                  <Box>
                    <Text fontSize="sm" fontWeight="medium">
                      {info.name}
                    </Text>
                    {info.description ? (
                      <Text fontSize="xs" color="fg.muted">
                        {info.description}
                      </Text>
                    ) : null}
                  </Box>
                </HStack>
                {included ? (
                  <PluginConfigForm
                    schema={info.configSchema}
                    values={displayValues}
                    onChange={(field, value) => handleFieldChange(info, field, value)}
                    applyConfigImport={async ({ action, rawText, mode, existingValue }) =>
                      previewPluginConfigImport(info.name, {
                        action,
                        rawText,
                        mode: mode as ConfigImportMode,
                        existingValue,
                      })
                    }
                    onConfigImportError={(message) => {
                      toaster.create({ title: "Import failed", description: message, type: "error" })
                    }}
                    onConfigImportSuccess={(message) => {
                      toaster.create({ title: message, type: "success" })
                    }}
                  />
                ) : null}
              </Box>
            )
          })}
        </VStack>
      )}
    </Box>
  )
}
