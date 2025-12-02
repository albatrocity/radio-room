import React, { useMemo } from "react"
import {
  Box,
  Button,
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Heading,
  HStack,
  Input,
  NumberDecrementStepper,
  NumberIncrementStepper,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Radio,
  RadioGroup,
  Stack,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  VStack,
  Wrap,
  WrapItem,
  useDisclosure,
} from "@chakra-ui/react"
import Picker from "@emoji-mart/react"
import data from "@emoji-mart/data"
import { interpolateTemplate, interpolateCompositeTemplate } from "@repo/utils"
import type {
  PluginConfigSchema,
  PluginFieldMeta,
  PluginSchemaElement,
  PluginFieldType,
} from "../../../types/PluginSchema"
import type { CompositeTemplate } from "../../../types/PluginComponent"

interface PluginConfigFormProps {
  schema: PluginConfigSchema
  values: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
  /** Parent field value for conditional visibility */
  allValues?: Record<string, unknown>
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
    <Checkbox isChecked={value as boolean} onChange={(e) => onChange(e.target.checked)}>
      {meta.label}
    </Checkbox>
  )
}

function StringField({ meta, value, onChange }: FieldProps) {
  return (
    <>
      <FormLabel>{meta.label}</FormLabel>
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
      <FormLabel>
        {label}
        {suffix && ` (${suffix})`}
      </FormLabel>
      <NumberInput
        value={displayValue as number}
        onChange={(_, num) => {
          const storageVal = toStorageValue(num, meta)
          onChange(storageVal)
        }}
      >
        <NumberInputField />
        <NumberInputStepper>
          <NumberIncrementStepper />
          <NumberDecrementStepper />
        </NumberInputStepper>
      </NumberInput>
    </>
  )
}

function EnumField({ fieldName, meta, value, onChange, jsonSchema }: FieldProps) {
  const options = getEnumOptions(jsonSchema, fieldName)

  return (
    <>
      <FormLabel>{meta.label}</FormLabel>
      <RadioGroup value={value as string} onChange={onChange}>
        <Stack direction="column" spacing={2}>
          {options.map((option) => (
            <Radio key={option} value={option}>
              {meta.enumLabels?.[option] || option}
            </Radio>
          ))}
        </Stack>
      </RadioGroup>
    </>
  )
}

function EmojiField({ meta, value, onChange }: FieldProps) {
  const { isOpen, onOpen, onClose } = useDisclosure()

  return (
    <>
      <FormLabel>{meta.label}</FormLabel>
      <Popover isLazy isOpen={isOpen} onClose={onClose} autoFocus={true}>
        <PopoverTrigger>
          <Button onClick={onOpen} variant="outline" justifyContent="flex-start" width="full">
            <HStack>
              <Box fontSize="2xl">
                {/* @ts-ignore - em-emoji is a custom element */}
                <em-emoji shortcodes={`:${value}:`} />
              </Box>
              <Text>:{value as string}:</Text>
            </HStack>
          </Button>
        </PopoverTrigger>
        <PopoverContent width="full">
          <PopoverArrow />
          <PopoverBody
            sx={{
              "em-emoji-picker": { "--shadow": "0" },
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
          </PopoverBody>
        </PopoverContent>
      </Popover>
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
      <FormLabel>{meta.label}</FormLabel>
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
            <WrapItem key={item}>
              <Tag size="md" colorScheme="blue">
                <TagLabel>{item}</TagLabel>
                <TagCloseButton onClick={() => removeItem(item)} />
              </Tag>
            </WrapItem>
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
 * A dynamic form renderer that maps semantic field types to Chakra UI components.
 * Renders plugin configuration forms based on the schema definition.
 */
export default function PluginConfigForm({
  schema,
  values,
  onChange,
  allValues,
}: PluginConfigFormProps) {
  const effectiveValues = allValues || values

  return (
    <VStack spacing={6} align="stretch">
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
            <FormControl key={item}>
              {renderField(
                item,
                meta,
                values[item],
                (value) => onChange(item, value),
                schema.jsonSchema,
              )}
              {meta.description && <FormHelperText>{meta.description}</FormHelperText>}
            </FormControl>
          )
        }

        // Handle schema elements (text blocks, headings)
        return renderSchemaElement(item, index, effectiveValues)
      })}
    </VStack>
  )
}
