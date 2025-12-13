import React, { useMemo, useState } from "react"
import {
  Box,
  Button,
  Checkbox,
  Field,
  Heading,
  HStack,
  Input,
  NumberInput,
  Popover,
  RadioGroup,
  Stack,
  Tag,
  Text,
  VStack,
  Wrap,
  useDisclosure,
  CloseButton,
} from "@chakra-ui/react"
import Picker from "@emoji-mart/react"
import data from "@emoji-mart/data"
import { interpolateTemplate, interpolateCompositeTemplate } from "@repo/utils"
import type {
  PluginConfigSchema,
  PluginFieldMeta,
  PluginSchemaElement,
  PluginFieldType,
  PluginActionElement,
} from "../../../types/PluginSchema"
import type { CompositeTemplate } from "../../../types/PluginComponent"
import { emitToSocket, subscribeById, unsubscribeById } from "../../../actors/socketActor"
import { toaster } from "../../ui/toaster"

interface PluginConfigFormProps {
  schema: PluginConfigSchema
  values: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
  /** Parent field value for conditional visibility */
  allValues?: Record<string, unknown>
  /** Plugin name - required for executing actions */
  pluginName?: string
}

/**
 * Check if an element should be visible based on its showWhen condition(s).
 * If an array is provided, ALL conditions must be true (AND logic).
 */
function shouldShow(
  showWhen: { field: string; value: unknown } | { field: string; value: unknown }[] | undefined,
  allValues: Record<string, unknown>,
): boolean {
  if (!showWhen) return true

  // Handle array of conditions (AND logic)
  if (Array.isArray(showWhen)) {
    return showWhen.every((condition) => allValues[condition.field] === condition.value)
  }

  // Handle single condition
  return allValues[showWhen.field] === showWhen.value
}

/**
 * Convert stored value to display value based on field type
 */
function toDisplayValue(value: unknown, meta: PluginFieldMeta): unknown {
  if (meta.type === "duration" && typeof value === "number") {
    // Convert from storage unit to display unit
    if (meta.storageUnit === "milliseconds" && meta.displayUnit === "seconds") {
      return value / 1000
    }
    if (meta.storageUnit === "milliseconds" && meta.displayUnit === "minutes") {
      return value / 60000
    }
  }
  return value
}

/**
 * Convert display value to storage value based on field type
 */
function toStorageValue(value: unknown, meta: PluginFieldMeta): unknown {
  if (meta.type === "duration" && typeof value === "number") {
    // Convert from display unit to storage unit
    if (meta.storageUnit === "milliseconds" && meta.displayUnit === "seconds") {
      return value * 1000
    }
    if (meta.storageUnit === "milliseconds" && meta.displayUnit === "minutes") {
      return value * 60000
    }
  }
  return value
}

/**
 * Get enum options from JSON Schema
 */
function getEnumOptions(jsonSchema: Record<string, unknown>, fieldName: string): string[] {
  const properties = jsonSchema.properties as Record<string, any> | undefined
  if (!properties || !properties[fieldName]) return []
  return properties[fieldName].enum || []
}

// ============================================================================
// Field Renderers
// ============================================================================

interface FieldProps {
  fieldName: string
  meta: PluginFieldMeta
  value: unknown
  onChange: (value: unknown) => void
  jsonSchema: Record<string, unknown>
}

function BooleanField({ meta, value, onChange }: FieldProps) {
  return (
    <Checkbox.Root checked={value as boolean} onCheckedChange={(e) => onChange(e.checked)}>
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label>{meta.label}</Checkbox.Label>
    </Checkbox.Root>
  )
}

function StringField({ meta, value, onChange }: FieldProps) {
  return (
    <>
      <Field.Label>{meta.label}</Field.Label>
      <Input
        value={(value as string) || ""}
        onChange={(e) => onChange(e.target.value)}
        placeholder={meta.placeholder}
      />
    </>
  )
}

function NumberField({ meta, value, onChange }: FieldProps) {
  const displayValue = toDisplayValue(value, meta)
  const suffix = meta.type === "percentage" ? "%" : ""
  const label =
    meta.type === "duration" && meta.displayUnit
      ? `${meta.label} (${meta.displayUnit})`
      : meta.label

  return (
    <>
      <Field.Label>
        {label}
        {suffix && ` (${suffix})`}
      </Field.Label>
      <NumberInput.Root
        value={String(displayValue as number)}
        onValueChange={(details) => {
          const storageVal = toStorageValue(details.valueAsNumber, meta)
          onChange(storageVal)
        }}
      >
        <NumberInput.Input />
      </NumberInput.Root>
    </>
  )
}

function EnumField({ fieldName, meta, value, onChange, jsonSchema }: FieldProps) {
  const options = getEnumOptions(jsonSchema, fieldName)

  return (
    <>
      <Field.Label>{meta.label}</Field.Label>
      <RadioGroup.Root value={value as string} onValueChange={(e) => onChange(e.value)}>
        <Stack direction="column" gap={2}>
          {options.map((option) => (
            <RadioGroup.Item key={option} value={option}>
              <RadioGroup.ItemHiddenInput />
              <RadioGroup.ItemControl />
              <RadioGroup.ItemText>{meta.enumLabels?.[option] || option}</RadioGroup.ItemText>
            </RadioGroup.Item>
          ))}
        </Stack>
      </RadioGroup.Root>
    </>
  )
}

function EmojiField({ meta, value, onChange }: FieldProps) {
  const { open, onOpen, onClose } = useDisclosure()

  return (
    <>
      <Field.Label>{meta.label}</Field.Label>
      <Popover.Root lazyMount open={open} onOpenChange={(e) => !e.open && onClose()} autoFocus>
        <Popover.Trigger asChild>
          <Button onClick={onOpen} variant="outline" justifyContent="flex-start" width="full">
            <HStack>
              <Box fontSize="2xl">
                {/* @ts-ignore - em-emoji is a custom element */}
                <em-emoji shortcodes={`:${value}:`} />
              </Box>
              <Text>:{value as string}:</Text>
            </HStack>
          </Button>
        </Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content width="full">
            <Popover.Arrow />
            <Popover.Body
              css={{
                "& em-emoji-picker": { "--shadow": "0" },
                overflow: "hidden",
              }}
            >
              <Picker
                data={data}
                height="200px"
                onEmojiSelect={(emoji: any) => {
                  onChange(emoji.id)
                  onClose()
                }}
                previewPosition="none"
              />
            </Popover.Body>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    </>
  )
}

function StringArrayField({ meta, value, onChange }: FieldProps) {
  const [inputValue, setInputValue] = React.useState("")
  const items = (value as string[]) || []

  const addItem = () => {
    if (inputValue.trim() && !items.includes(inputValue.trim())) {
      onChange([...items, inputValue.trim()])
      setInputValue("")
    }
  }

  const removeItem = (item: string) => {
    onChange(items.filter((i) => i !== item))
  }

  return (
    <>
      <Field.Label>{meta.label}</Field.Label>
      <HStack>
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={meta.placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addItem()
            }
          }}
        />
        <Button onClick={addItem} size="sm">
          Add
        </Button>
      </HStack>
      {items.length > 0 && (
        <Wrap mt={2}>
          {items.map((item) => (
            <Tag.Root key={item} size="md" colorPalette="blue">
              <Tag.Label>{item}</Tag.Label>
              <Tag.CloseTrigger onClick={() => removeItem(item)} />
            </Tag.Root>
          ))}
        </Wrap>
      )}
    </>
  )
}

/**
 * Render a form field based on its type
 */
function renderField(
  fieldName: string,
  meta: PluginFieldMeta,
  value: unknown,
  onChange: (value: unknown) => void,
  jsonSchema: Record<string, unknown>,
): React.ReactNode {
  const props: FieldProps = { fieldName, meta, value, onChange, jsonSchema }

  switch (meta.type) {
    case "boolean":
      return <BooleanField {...props} />
    case "string":
    case "url":
    case "color":
      return <StringField {...props} />
    case "number":
    case "percentage":
    case "duration":
      return <NumberField {...props} />
    case "enum":
      return <EnumField {...props} />
    case "emoji":
      return <EmojiField {...props} />
    case "string-array":
      return <StringArrayField {...props} />
    default:
      return <StringField {...props} />
  }
}

/**
 * Renders a simple composite template component (for config forms).
 * Only supports basic components like emoji - no complex plugin components.
 */
function renderConfigFormTemplateComponent(
  name: string,
  props: Record<string, string>,
  key: string,
): React.ReactNode {
  if (name === "emoji") {
    return (
      <Box as="span" key={key} display="inline-block" verticalAlign="middle">
        {/* @ts-ignore - em-emoji is a custom element from emoji-mart */}
        <em-emoji shortcodes={props.shortcodes || props.id} />
      </Box>
    )
  }

  // Fallback for unknown components
  return (
    <Text as="span" key={key} color="red.500">
      [Unknown: {name}]
    </Text>
  )
}

/**
 * Renders content that can be either a string or CompositeTemplate
 */
function renderContent(
  content: string | CompositeTemplate,
  allValues: Record<string, unknown>,
): React.ReactNode {
  // If it's a string, use simple template interpolation
  if (typeof content === "string") {
    return <span dangerouslySetInnerHTML={{ __html: interpolateTemplate(content, allValues) }} />
  }

  // If it's a CompositeTemplate, interpolate and render components
  const interpolated = interpolateCompositeTemplate(content, allValues)

  return (
    <>
      {interpolated.map((part, index) => {
        const key =
          part.type === "text"
            ? `text-${index}-${part.content.substring(0, 20)}`
            : `component-${index}-${part.name}`

        if (part.type === "text") {
          return <React.Fragment key={key}>{part.content}</React.Fragment>
        } else if (part.type === "component") {
          return renderConfigFormTemplateComponent(part.name, part.props, key)
        }
        return null
      })}
    </>
  )
}

/**
 * Render a schema element (text block or heading)
 */
function renderSchemaElement(
  element: PluginSchemaElement,
  index: number,
  allValues: Record<string, unknown>,
): React.ReactNode {
  // Check conditional visibility for schema elements
  if (!shouldShow(element.showWhen, allValues)) {
    return null
  }

  if (element.type === "heading") {
    return (
      <Heading key={`heading-${index}`} as="h3" size="md" mb={2}>
        {renderContent(element.content, allValues)}
      </Heading>
    )
  }

  if (element.type === "text-block") {
    const bgColor =
      element.variant === "warning"
        ? "critical"
        : element.variant === "example"
        ? "secondaryBg"
        : "secondaryBg"

    return (
      <Box key={`text-${index}`} p={3} borderRadius="md" bg={bgColor}>
        <Text fontSize="sm">{renderContent(element.content, allValues)}</Text>
      </Box>
    )
  }

  return null
}

/**
 * Action button component with optional confirmation popover
 */
function ActionButton({
  element,
  pluginName,
}: {
  element: PluginActionElement
  pluginName: string
}) {
  const [isLoading, setIsLoading] = useState(false)
  const subscriptionIdRef = React.useRef<string | null>(null)

  const executeAction = () => {
    setIsLoading(true)

    // Create a unique subscription ID
    const subscriptionId = `plugin-action-${element.action}-${Date.now()}`
    subscriptionIdRef.current = subscriptionId

    // Subscribe to the result event
    subscribeById(subscriptionId, {
      send: (event: { type: string; data?: { success: boolean; message?: string } }) => {
        if (event.type === "PLUGIN_ACTION_RESULT" && event.data) {
          setIsLoading(false)
          unsubscribeById(subscriptionId)
          subscriptionIdRef.current = null

          if (event.data.success) {
            toaster.create({
              title: "Success",
              description: event.data.message || "Action completed successfully",
              type: "success",
            })
          } else {
            toaster.create({
              title: "Error",
              description: event.data.message || "Action failed",
              type: "error",
            })
          }
        }
      },
    })

    // Execute the action
    emitToSocket("EXECUTE_PLUGIN_ACTION", {
      pluginName,
      action: element.action,
    })

    // Timeout after 10 seconds
    setTimeout(() => {
      if (subscriptionIdRef.current === subscriptionId) {
        setIsLoading(false)
        unsubscribeById(subscriptionId)
        subscriptionIdRef.current = null
        toaster.create({
          title: "Timeout",
          description: "Action timed out",
          type: "error",
        })
      }
    }, 10000)
  }

  const buttonVariant = element.variant === "destructive" ? "outline" : element.variant || "solid"
  const buttonColorPalette = element.variant === "destructive" ? "red" : undefined

  // If confirmation is required, wrap in a popover
  if (element.confirmMessage) {
    return (
      <Popover.Root>
        <Popover.Trigger asChild>
          <Button variant={buttonVariant} colorPalette={buttonColorPalette} loading={isLoading}>
            {element.label}
          </Button>
        </Popover.Trigger>
        <Popover.Positioner>
          <Popover.Content>
            <Popover.Arrow />
            <Popover.CloseTrigger asChild position="absolute" top="1" right="1">
              <CloseButton size="sm" />
            </Popover.CloseTrigger>
            <Popover.Body>
              <Text>{element.confirmMessage}</Text>
            </Popover.Body>
            <Popover.Footer justifyContent="flex-end" display="flex">
              <Button colorPalette="red" onClick={executeAction} loading={isLoading}>
                {element.confirmText || "Confirm"}
              </Button>
            </Popover.Footer>
          </Popover.Content>
        </Popover.Positioner>
      </Popover.Root>
    )
  }

  // No confirmation required, just a simple button
  return (
    <Button
      variant={buttonVariant}
      colorPalette={buttonColorPalette}
      onClick={executeAction}
      loading={isLoading}
    >
      {element.label}
    </Button>
  )
}

/**
 * Render an action element
 */
function renderActionElement(
  element: PluginActionElement,
  index: number,
  allValues: Record<string, unknown>,
  pluginName?: string,
): React.ReactNode {
  // Check conditional visibility
  if (!shouldShow(element.showWhen, allValues)) {
    return null
  }

  if (!pluginName) {
    console.warn("PluginConfigForm: pluginName is required to render action buttons")
    return null
  }

  return (
    <Box key={`action-${index}`}>
      <ActionButton element={element} pluginName={pluginName} />
    </Box>
  )
}

/**
 * A dynamic form renderer that maps semantic field types to Chakra UI components.
 * Renders plugin configuration forms based on the schema definition.
 */
export default function PluginConfigForm({
  schema,
  values,
  onChange,
  allValues,
  pluginName,
}: PluginConfigFormProps) {
  const effectiveValues = allValues || values

  return (
    <VStack gap={6} align="stretch">
      {schema.layout.map((item, index) => {
        // Handle string items (field names)
        if (typeof item === "string") {
          const meta = schema.fieldMeta[item]
          if (!meta) {
            console.warn(`No fieldMeta found for field: ${item}`)
            return null
          }

          // Check conditional visibility
          if (!shouldShow(meta.showWhen, effectiveValues)) {
            return null
          }

          return (
            <Field.Root key={item}>
              {renderField(
                item,
                meta,
                values[item],
                (value) => onChange(item, value),
                schema.jsonSchema,
              )}
              {meta.description && <Field.HelperText>{meta.description}</Field.HelperText>}
            </Field.Root>
          )
        }

        // Handle action elements
        if (item.type === "action") {
          return renderActionElement(
            item as PluginActionElement,
            index,
            effectiveValues,
            pluginName,
          )
        }

        // Handle schema elements (text blocks, headings)
        return renderSchemaElement(item as PluginSchemaElement, index, effectiveValues)
      })}
    </VStack>
  )
}
