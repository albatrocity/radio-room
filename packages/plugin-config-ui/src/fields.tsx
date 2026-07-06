import React, { useId, useState } from "react"
import {
  Box,
  Button,
  Checkbox,
  CheckboxGroup,
  DatePicker,
  Field,
  HStack,
  IconButton,
  Input,
  NumberInput,
  Popover,
  Portal,
  RadioGroup,
  Stack,
  Tag,
  Text,
  VStack,
  Wrap,
  useDisclosure,
} from "@chakra-ui/react"
import { LuCalendar, LuChevronUp, LuChevronDown, LuTrash2, LuPlus } from "react-icons/lu"
import { CalendarDateTime, getLocalTimeZone } from "@internationalized/date"
import type { DateValue } from "@internationalized/date"
import Picker from "@emoji-mart/react"
import data from "@emoji-mart/data"
import type { PluginFieldMeta } from "@repo/types/Plugin"
import { shouldShow, emptyRow, addRow, removeRow, updateRow, moveRow, getItemJsonSchema } from "./logic"

export interface FieldProps {
  fieldName: string
  meta: PluginFieldMeta
  value: unknown
  onChange: (value: unknown) => void
  jsonSchema: Record<string, unknown>
}

function toDisplayValue(value: unknown, meta: PluginFieldMeta): unknown {
  if (meta.type === "duration" && typeof value === "number") {
    if (meta.storageUnit === "milliseconds" && meta.displayUnit === "seconds") return value / 1000
    if (meta.storageUnit === "milliseconds" && meta.displayUnit === "minutes") return value / 60000
  }
  return value
}

function toStorageValue(value: unknown, meta: PluginFieldMeta): unknown {
  if (meta.type === "duration" && typeof value === "number") {
    if (meta.storageUnit === "milliseconds" && meta.displayUnit === "seconds") return value * 1000
    if (meta.storageUnit === "milliseconds" && meta.displayUnit === "minutes") return value * 60000
  }
  return value
}

function getEnumOptions(jsonSchema: Record<string, unknown>, fieldName: string): string[] {
  const properties = jsonSchema.properties as Record<string, any> | undefined
  if (!properties || !properties[fieldName]) return []
  return properties[fieldName].enum || []
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
    meta.type === "duration" && meta.displayUnit ? `${meta.label} (${meta.displayUnit})` : meta.label

  return (
    <>
      <Field.Label>
        {label}
        {suffix && ` (${suffix})`}
      </Field.Label>
      <NumberInput.Root
        value={String(displayValue as number)}
        onValueChange={(details) => onChange(toStorageValue(details.valueAsNumber, meta))}
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
            <Popover.Body css={{ "& em-emoji-picker": { "--shadow": "0" }, overflow: "hidden" }}>
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
  const [inputValue, setInputValue] = useState("")
  const items = (value as string[]) || []

  const addItems = (newItems: string[]) => {
    const trimmed = newItems.map((i) => i.trim()).filter((i) => i && !items.includes(i))
    if (trimmed.length > 0) onChange([...items, ...trimmed])
  }
  const addItem = () => {
    if (inputValue.trim() && !items.includes(inputValue.trim())) {
      onChange([...items, inputValue.trim()])
      setInputValue("")
    }
  }
  const removeItem = (item: string) => onChange(items.filter((i) => i !== item))
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").trim()
    e.preventDefault()
    if (pasted.includes(",")) {
      addItems(pasted.split(","))
      setInputValue("")
    } else {
      setInputValue(pasted)
    }
  }

  return (
    <>
      <Field.Label>{meta.label}</Field.Label>
      <HStack>
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value.trim())}
          placeholder={meta.placeholder}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addItem()
            }
          }}
          onPaste={handlePaste}
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
              <Tag.EndElement>
                <Tag.CloseTrigger onClick={() => removeItem(item)} />
              </Tag.EndElement>
            </Tag.Root>
          ))}
        </Wrap>
      )}
    </>
  )
}

function safeIdFragment(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]/g, "-")
}

function CheckboxGroupField({ meta, value, onChange }: FieldProps) {
  const selected = Array.isArray(value) ? (value as string[]) : []
  const options = meta.options ?? []
  const idPrefix = useId().replace(/:/g, "")
  return (
    <>
      <Field.Label>{meta.label}</Field.Label>
      <CheckboxGroup value={selected} onValueChange={(nextValue) => onChange(nextValue)}>
        <VStack align="stretch" gap={2}>
          {options.map((opt) => {
            const frag = safeIdFragment(opt.value)
            return (
              <Checkbox.Root
                key={opt.value}
                value={opt.value}
                ids={{
                  root: `${idPrefix}-root-${frag}`,
                  hiddenInput: `${idPrefix}-input-${frag}`,
                  control: `${idPrefix}-control-${frag}`,
                  label: `${idPrefix}-label-${frag}`,
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label>{opt.label}</Checkbox.Label>
              </Checkbox.Root>
            )
          })}
        </VStack>
      </CheckboxGroup>
    </>
  )
}

function epochToCalendarDateTime(epochMs: number | null | undefined): CalendarDateTime | undefined {
  if (epochMs == null || !Number.isFinite(epochMs)) return undefined
  const d = new Date(epochMs)
  return new CalendarDateTime(d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes())
}

function calendarDateTimeToEpoch(cdt: DateValue | null | undefined): number | null {
  if (!cdt) return null
  return cdt.toDate(getLocalTimeZone()).getTime()
}

function DatetimeField({ meta, value, onChange }: FieldProps) {
  const dateValue = epochToCalendarDateTime(value as number | null)
  const [timeValue, setTimeValue] = useState(() => {
    if (dateValue) {
      const pad = (n: number) => String(n).padStart(2, "0")
      return `${pad(dateValue.hour)}:${pad(dateValue.minute)}`
    }
    return "12:00"
  })

  const handleDateChange = (details: { value: DateValue[] }) => {
    const selected = details.value[0]
    if (!selected) {
      onChange(null)
      return
    }
    const [hours, minutes] = timeValue.split(":").map(Number)
    onChange(
      calendarDateTimeToEpoch(
        new CalendarDateTime(selected.year, selected.month, selected.day, hours || 0, minutes || 0),
      ),
    )
  }
  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value
    setTimeValue(newTime)
    if (dateValue) {
      const [hours, minutes] = newTime.split(":").map(Number)
      onChange(
        calendarDateTimeToEpoch(
          new CalendarDateTime(dateValue.year, dateValue.month, dateValue.day, hours || 0, minutes || 0),
        ),
      )
    }
  }

  return (
    <VStack align="stretch" gap={2}>
      <DatePicker.Root
        value={dateValue ? [dateValue] : []}
        onValueChange={handleDateChange}
        closeOnSelect
        timeZone={getLocalTimeZone()}
      >
        <DatePicker.Label>{meta.label}</DatePicker.Label>
        <DatePicker.Control>
          <DatePicker.Input />
          <DatePicker.Trigger>
            <LuCalendar />
          </DatePicker.Trigger>
        </DatePicker.Control>
        <Portal>
          <DatePicker.Positioner>
            <DatePicker.Content>
              <DatePicker.View view="day">
                <DatePicker.Context>
                  {(api) => (
                    <>
                      <DatePicker.ViewControl>
                        <DatePicker.PrevTrigger />
                        <DatePicker.ViewTrigger>
                          <DatePicker.RangeText />
                        </DatePicker.ViewTrigger>
                        <DatePicker.NextTrigger />
                      </DatePicker.ViewControl>
                      <DatePicker.Table>
                        <DatePicker.TableHead>
                          <DatePicker.TableRow>
                            {api.weekDays.map((weekDay, i) => (
                              <DatePicker.TableHeader key={i}>{weekDay.narrow}</DatePicker.TableHeader>
                            ))}
                          </DatePicker.TableRow>
                        </DatePicker.TableHead>
                        <DatePicker.TableBody>
                          {api.weeks.map((week, i) => (
                            <DatePicker.TableRow key={i}>
                              {week.map((day, j) => (
                                <DatePicker.TableCell key={j} value={day}>
                                  <DatePicker.TableCellTrigger>{day.day}</DatePicker.TableCellTrigger>
                                </DatePicker.TableCell>
                              ))}
                            </DatePicker.TableRow>
                          ))}
                        </DatePicker.TableBody>
                      </DatePicker.Table>
                    </>
                  )}
                </DatePicker.Context>
              </DatePicker.View>
            </DatePicker.Content>
          </DatePicker.Positioner>
        </Portal>
      </DatePicker.Root>
      <HStack>
        <Text fontSize="sm" color="fg.muted" flexShrink={0}>
          Time:
        </Text>
        <Input type="time" value={timeValue} onChange={handleTimeChange} size="sm" width="auto" />
      </HStack>
    </VStack>
  )
}

/**
 * Repeatable group of sub-fields. Value is `Record<string, unknown>[]`.
 * Nested `showWhen` on sub-fields resolves against the *row* object, and nested
 * enum options resolve from `jsonSchema.properties[field].items`.
 */
function ObjectArrayField({ fieldName, meta, value, onChange, jsonSchema }: FieldProps) {
  const rows = (Array.isArray(value) ? value : []) as Record<string, unknown>[]
  const itemFields = meta.itemFields ?? []
  const itemJsonSchema = getItemJsonSchema(jsonSchema, fieldName)
  const itemLabel = meta.itemLabel ?? "Item"
  const atMax = meta.maxItems != null && rows.length >= meta.maxItems

  return (
    <VStack align="stretch" gap={3}>
      <Field.Label>{meta.label}</Field.Label>
      {rows.map((row, index) => (
        <Box key={index} borderWidth="1px" borderColor="border.muted" borderRadius="md" p={3}>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="sm" fontWeight="medium">
              {itemLabel} {index + 1}
            </Text>
            <HStack gap={1}>
              <IconButton
                aria-label="Move up"
                size="xs"
                variant="ghost"
                disabled={index === 0}
                onClick={() => onChange(moveRow(rows, index, index - 1))}
              >
                <LuChevronUp />
              </IconButton>
              <IconButton
                aria-label="Move down"
                size="xs"
                variant="ghost"
                disabled={index === rows.length - 1}
                onClick={() => onChange(moveRow(rows, index, index + 1))}
              >
                <LuChevronDown />
              </IconButton>
              <IconButton
                aria-label="Remove"
                size="xs"
                variant="ghost"
                colorPalette="red"
                onClick={() => onChange(removeRow(rows, index))}
              >
                <LuTrash2 />
              </IconButton>
            </HStack>
          </HStack>
          <VStack align="stretch" gap={3}>
            {itemFields.map(({ name, meta: subMeta }) => {
              if (!shouldShow(subMeta.showWhen, row)) return null
              return (
                <Field.Root key={name}>
                  {renderField(name, subMeta, row[name], (v) => onChange(updateRow(rows, index, name, v)), itemJsonSchema)}
                  {subMeta.description && <Field.HelperText>{subMeta.description}</Field.HelperText>}
                </Field.Root>
              )
            })}
          </VStack>
        </Box>
      ))}
      <Box>
        <Button
          size="sm"
          variant="outline"
          disabled={atMax}
          onClick={() => onChange(addRow(rows, emptyRow(itemFields)))}
        >
          <LuPlus /> Add {itemLabel.toLowerCase()}
        </Button>
      </Box>
    </VStack>
  )
}

/** Render a form field based on its type. Recurses for `object-array`. */
export function renderField(
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
    case "checkbox-group":
      return <CheckboxGroupField {...props} />
    case "datetime":
      return <DatetimeField {...props} />
    case "object-array":
      return <ObjectArrayField {...props} />
    default:
      return <StringField {...props} />
  }
}
