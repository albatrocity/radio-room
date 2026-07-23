import React from "react"
import { Box, Field, Heading, Text, VStack } from "@chakra-ui/react"
import { interpolateTemplate, interpolateCompositeTemplate } from "@repo/utils"
import type {
  PluginConfigSchema,
  PluginSchemaElement,
  PluginActionElement,
} from "@repo/types/Plugin"
import type { CompositeTemplate } from "@repo/types/PluginComponent"
import { shouldShow } from "./logic"
import { renderField } from "./fields"
import {
  ConfigImportActionButton,
  type ApplyConfigImportFn,
} from "./ConfigImportActionButton"

export interface PluginConfigFormProps {
  schema: PluginConfigSchema
  values: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
  /** Values used for conditional visibility (defaults to `values`). */
  allValues?: Record<string, unknown>
  /**
   * Host-provided renderer for `action` layout elements. Actions require app context
   * (socket, toaster, room users) so they are injected rather than baked in.
   * When omitted, only `configImport` actions render (via {@link applyConfigImport}).
   */
  renderAction?: (element: PluginActionElement, allValues: Record<string, unknown>) => React.ReactNode
  /**
   * Authoring-host path for `configImport` actions when `renderAction` is omitted (ADR 0075).
   * Dry-run parse+merge; result is written through `onChange`.
   */
  applyConfigImport?: ApplyConfigImportFn
  /** Optional error surface for config-import failures (e.g. toaster). */
  onConfigImportError?: (message: string) => void
  /** Optional success surface after a config-import apply (e.g. toaster). */
  onConfigImportSuccess?: (message: string) => void
  /** Optional override for composite-template component parts. Defaults to an emoji renderer. */
  renderTemplateComponent?: (name: string, props: Record<string, string>, key: string) => React.ReactNode
}

export type { ApplyConfigImportFn }

function defaultTemplateComponent(name: string, props: Record<string, string>, key: string): React.ReactNode {
  if (name === "emoji") {
    return (
      <Box as="span" key={key} display="inline-block" verticalAlign="middle">
        {/* @ts-ignore - em-emoji is a custom element from emoji-mart */}
        <em-emoji shortcodes={props.shortcodes || props.id} />
      </Box>
    )
  }
  return (
    <Text as="span" key={key} color="red.500">
      [Unknown: {name}]
    </Text>
  )
}

function renderContent(
  content: string | CompositeTemplate,
  allValues: Record<string, unknown>,
  renderTemplateComponent: (name: string, props: Record<string, string>, key: string) => React.ReactNode,
): React.ReactNode {
  if (typeof content === "string") {
    return <span dangerouslySetInnerHTML={{ __html: interpolateTemplate(content, allValues) }} />
  }
  const interpolated = interpolateCompositeTemplate(content, allValues)
  return (
    <>
      {interpolated.map((part, index) => {
        const key =
          part.type === "text"
            ? `text-${index}-${part.content.substring(0, 20)}`
            : `component-${index}-${part.name}`
        if (part.type === "text") return <React.Fragment key={key}>{part.content}</React.Fragment>
        if (part.type === "component") return renderTemplateComponent(part.name, part.props, key)
        return null
      })}
    </>
  )
}

function renderSchemaElement(
  element: PluginSchemaElement,
  index: number,
  allValues: Record<string, unknown>,
  renderTemplateComponent: (name: string, props: Record<string, string>, key: string) => React.ReactNode,
): React.ReactNode {
  if (!shouldShow(element.showWhen, allValues)) return null

  if (element.type === "heading") {
    return (
      <Heading key={`heading-${index}`} as="h3" size="md" mb={2}>
        {renderContent(element.content, allValues, renderTemplateComponent)}
      </Heading>
    )
  }
  if (element.type === "text-block") {
    const bgColor = element.variant === "warning" ? "critical" : "secondaryBg"
    return (
      <Box key={`text-${index}`} p={3} borderRadius="md" bg={bgColor}>
        <Text fontSize="sm">{renderContent(element.content, allValues, renderTemplateComponent)}</Text>
      </Box>
    )
  }
  return null
}

/**
 * Dynamic, app-agnostic plugin config form renderer. Depends only on `@repo/types`,
 * `@repo/utils`, and UI libs — usable by both `apps/web` and `apps/scheduler`.
 */
export function PluginConfigForm({
  schema,
  values,
  onChange,
  allValues,
  renderAction,
  applyConfigImport,
  onConfigImportError,
  onConfigImportSuccess,
  renderTemplateComponent = defaultTemplateComponent,
}: PluginConfigFormProps) {
  const effectiveValues = allValues || values

  return (
    <VStack gap={6} align="stretch">
      {schema.layout.map((item, index) => {
        if (typeof item === "string") {
          const meta = schema.fieldMeta[item]
          if (!meta) return null
          if (!shouldShow(meta.showWhen, effectiveValues)) return null
          return (
            <Field.Root key={item}>
              {renderField(item, meta, values[item], (value) => onChange(item, value), schema.jsonSchema)}
              {meta.description && <Field.HelperText>{meta.description}</Field.HelperText>}
            </Field.Root>
          )
        }

        if (item.type === "action") {
          const element = item as PluginActionElement
          if (!shouldShow(element.showWhen, effectiveValues)) return null

          if (renderAction) {
            return <Box key={`action-${index}`}>{renderAction(element, effectiveValues)}</Box>
          }

          // Authoring hosts: only configImport actions (dry-run via applyConfigImport).
          if (element.configImport && applyConfigImport) {
            const targetField = element.configImport.targetField
            return (
              <Box key={`action-${index}`}>
                <ConfigImportActionButton
                  element={element}
                  existingValue={effectiveValues[targetField]}
                  applyConfigImport={applyConfigImport}
                  onApplied={(field, value, message) => {
                    onChange(field, value)
                    if (message) onConfigImportSuccess?.(message)
                  }}
                  onError={onConfigImportError}
                />
              </Box>
            )
          }

          return null
        }

        return renderSchemaElement(
          item as PluginSchemaElement,
          index,
          effectiveValues,
          renderTemplateComponent,
        )
      })}
    </VStack>
  )
}

export default PluginConfigForm
