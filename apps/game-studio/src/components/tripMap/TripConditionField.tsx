import { Box, Checkbox, NativeSelect, Stack, Text } from "@chakra-ui/react"
import type { TripCondition } from "@repo/road-trip-map"

/**
 * The common `when` shapes (ADR 0230): one key, its absence, or all/any of
 * several keys. Anything nested further is shown as JSON and left alone.
 */

export type ConditionKey = { id: string; name: string }

type SimpleMode = "always" | "has" | "lacks" | "all" | "any"

const MODE_LABEL: Record<SimpleMode, string> = {
  always: "Always",
  has: "Only if the van has",
  lacks: "Unless the van has",
  all: "Only if the van has all of",
  any: "If the van has any of",
}

function hasIds(condition: TripCondition): string[] | null {
  if ("has" in condition) return [condition.has]
  if ("not" in condition) return "has" in condition.not ? [condition.not.has] : null
  const list = "all" in condition ? condition.all : condition.any
  const ids: string[] = []
  for (const child of list) {
    if (!("has" in child)) return null
    ids.push(child.has)
  }
  return ids
}

function modeOf(when: TripCondition | undefined): SimpleMode | "custom" {
  if (!when) return "always"
  if ("has" in when) return "has"
  if ("not" in when && "has" in when.not) return "lacks"
  const ids = hasIds(when)
  if (!ids || ids.length === 0) return "custom"
  return "all" in when ? "all" : "any" in when ? "any" : "custom"
}

function conditionFor(mode: Exclude<SimpleMode, "always">, ids: string[]): TripCondition | null {
  const unique = ids.filter((id, index) => id !== "" && ids.indexOf(id) === index).slice(0, 8)
  if (unique.length === 0) return null
  if (mode === "has") return { has: unique[0]! }
  if (mode === "lacks") return { not: { has: unique[0]! } }
  const leaves = unique.map((id) => ({ has: id }))
  return mode === "all" ? { all: leaves } : { any: leaves }
}

function Select({
  value,
  options,
  ariaLabel,
  onChange,
}: {
  value: string
  options: { id: string; label: string }[]
  ariaLabel: string
  onChange: (value: string) => void
}) {
  return (
    <NativeSelect.Root size="sm">
      <NativeSelect.Field
        aria-label={ariaLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  )
}

export function TripConditionField({
  when,
  keys,
  onChange,
  allowAlways = true,
}: {
  when: TripCondition | undefined
  keys: ConditionKey[]
  onChange: (when: TripCondition | undefined) => void
  /** Narrative cases always have a condition, so "Always" is hidden. */
  allowAlways?: boolean
}) {
  const mode = modeOf(when)
  if (mode === "custom" && when) {
    return (
      <Stack gap="1">
        <Text fontSize="xs" color="fg.muted">
          This condition is nested further than the editor can change. Edit it in the map file.
        </Text>
        <Box
          as="pre"
          fontSize="xs"
          fontFamily="mono"
          whiteSpace="pre-wrap"
          bg="bg.muted"
          borderRadius="md"
          p="2"
          m="0"
        >
          {JSON.stringify(when, null, 2)}
        </Box>
      </Stack>
    )
  }

  const known = [...keys]
  const selected = when ? (hasIds(when) ?? []) : []
  for (const id of selected) {
    if (!known.some((key) => key.id === id)) known.push({ id, name: id })
  }
  const modes = (Object.keys(MODE_LABEL) as SimpleMode[]).filter((entry) =>
    entry === "always" ? allowAlways : known.length > 0,
  )

  const apply = (next: SimpleMode, ids: string[]) => {
    if (next === "always") {
      onChange(undefined)
      return
    }
    const built = conditionFor(next, ids)
    if (built) onChange(built)
  }

  return (
    <Stack gap="1">
      <Select
        ariaLabel="When this applies"
        value={mode === "custom" ? "always" : mode}
        options={modes.map((entry) => ({ id: entry, label: MODE_LABEL[entry] }))}
        onChange={(next) => {
          const seed = selected.length > 0 ? selected : known[0] ? [known[0].id] : []
          apply(next as SimpleMode, next === "has" || next === "lacks" ? seed.slice(0, 1) : seed)
        }}
      />
      {mode === "has" || mode === "lacks" ? (
        <Select
          ariaLabel="Key item"
          value={selected[0] ?? ""}
          options={known.map((key) => ({ id: key.id, label: key.name }))}
          onChange={(id) => apply(mode, [id])}
        />
      ) : null}
      {mode === "all" || mode === "any" ? (
        <Stack gap="0">
          {known.map((key) => {
            const on = selected.includes(key.id)
            return (
              <Checkbox.Root
                key={key.id}
                size="sm"
                checked={on}
                onCheckedChange={() => {
                  const ids = on ? selected.filter((id) => id !== key.id) : [...selected, key.id]
                  if (ids.length === 0) return
                  apply(mode, ids)
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label fontSize="xs">{key.name}</Checkbox.Label>
              </Checkbox.Root>
            )
          })}
        </Stack>
      ) : null}
    </Stack>
  )
}
