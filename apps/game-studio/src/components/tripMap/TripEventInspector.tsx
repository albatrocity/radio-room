import {
  Box,
  Button,
  Checkbox,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react"
import {
  EVENT_FAMILIES,
  EVENT_FAMILY_LABELS,
  FUND_PURPOSE_LABELS,
  NARRATIVE_VARIANTS,
  VAN_CONSUMABLES,
  eventTrigger,
  incidentFundPurposeSchema,
  itemsResolving,
  type EventBeat,
  type EventFamily,
  type EventResolution,
  type NarrativeVariant,
} from "@repo/road-trip-map"
import type { EventEstimate, TripEventDraft } from "../../tripMap/tripMapDraft"

type Props = {
  event: TripEventDraft
  /** Null while the draft doesn't parse. */
  estimate: EventEstimate | null
  walletShare: (cost: number) => string
  onChange: (patch: Partial<TripEventDraft>) => void
  onRemove: () => void
}

type ResolutionKind = EventResolution["kind"]

const RESOLUTION_LABELS: Record<ResolutionKind, string> = {
  item: "Item fixes it",
  fund: "Room pays",
  wait: "Wait",
  tow: "Tow or shoulder repair",
  refuel: "Fuel truck",
}

const NEW_RESOLUTION: Record<ResolutionKind, EventResolution> = {
  item: { kind: "item" },
  fund: { kind: "fund", purpose: "roadside" },
  wait: { kind: "wait", minutes: 1 },
  tow: { kind: "tow" },
  refuel: { kind: "refuel" },
}

type NumberField = { key: string; label: string; step?: number; placeholder?: string }
type TextField = { key: string; label: string; maxLength: number }

/** Optional tuning per entry; blank keeps the engine default. */
const RESOLUTION_FIELDS: Record<ResolutionKind, { numbers: NumberField[]; texts: TextField[] }> = {
  item: {
    numbers: [
      { key: "windowMinutes", label: "Window minutes (stop only)", step: 0.5, placeholder: "1" },
    ],
    texts: [{ key: "label", label: "Step label", maxLength: 60 }],
  },
  fund: {
    numbers: [{ key: "baseCost", label: "Base cost" }],
    texts: [{ key: "provider", label: "Provider", maxLength: 60 }],
  },
  wait: {
    numbers: [{ key: "minutes", label: "Minutes", step: 0.5 }],
    texts: [
      { key: "label", label: "Step label", maxLength: 60 },
      { key: "status", label: "Headline while waiting", maxLength: 40 },
    ],
  },
  tow: {
    numbers: [
      { key: "towCost", label: "Tow cost" },
      { key: "towWaitMinutes", label: "Tow truck wait minutes", step: 0.5 },
      { key: "repairCost", label: "Repair cost" },
      { key: "repairMinutes", label: "Repair minutes", step: 0.5 },
    ],
    texts: [],
  },
  refuel: {
    numbers: [
      { key: "fee", label: "Delivery fee" },
      { key: "pricePerGallon", label: "Coins per gallon", step: 0.5 },
      { key: "waitMinutes", label: "Delivery minutes", step: 0.5 },
    ],
    texts: [{ key: "status", label: "Headline while waiting", maxLength: 40 }],
  },
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function narrativeVariant(value: string): NarrativeVariant | undefined {
  return NARRATIVE_VARIANTS.find((variant) => variant === value)
}

function eventFamily(value: string): EventFamily | undefined {
  return EVENT_FAMILIES.find((family) => family === value)
}

/** Drop blank optional keys so the JSON stays minimal. */
function withField<T extends object>(entry: T, key: string, value: unknown): T {
  const next: Record<string, unknown> = { ...entry, [key]: value }
  if (value === undefined || value === "") delete next[key]
  return next as T
}

function VariantSelect({
  value,
  onChange,
}: {
  value: NarrativeVariant | undefined
  onChange: (variant: NarrativeVariant | undefined) => void
}) {
  return (
    <NativeSelect.Root size="sm">
      <NativeSelect.Field
        value={value ?? ""}
        onChange={(e) => onChange(narrativeVariant(e.target.value))}
      >
        <option value="">Plain</option>
        {NARRATIVE_VARIANTS.map((variant) => (
          <option key={variant} value={variant}>
            {variant.charAt(0).toUpperCase() + variant.slice(1)}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  )
}

function ResolutionEntry({
  entry,
  family,
  onChange,
  onRemove,
  onMoveUp,
}: {
  entry: EventResolution
  family: EventFamily
  onChange: (entry: EventResolution) => void
  onRemove: () => void
  onMoveUp?: () => void
}) {
  const fields = RESOLUTION_FIELDS[entry.kind]
  const values = entry as Record<string, unknown>
  const familyItems = itemsResolving(family)
  return (
    <Box borderWidth="1px" borderRadius="md" p="2">
      <HStack justify="space-between" mb="2">
        <Text fontSize="xs" fontWeight="semibold">
          {RESOLUTION_LABELS[entry.kind]}
        </Text>
        <HStack gap="1">
          {onMoveUp ? (
            <Button size="2xs" variant="ghost" onClick={onMoveUp} aria-label="Move up">
              ↑
            </Button>
          ) : null}
          <Button size="2xs" variant="ghost" colorPalette="red" onClick={onRemove}>
            Remove
          </Button>
        </HStack>
      </HStack>
      {entry.kind === "item" ? (
        <HStack gap="3" flexWrap="wrap" mb="2">
          {VAN_CONSUMABLES.map((item) => {
            const checked = entry.items
              ? entry.items.includes(item.shortId)
              : familyItems.includes(item.shortId)
            return (
              <Checkbox.Root
                key={item.shortId}
                size="sm"
                checked={checked}
                onCheckedChange={(d) => {
                  const current = entry.items ?? familyItems
                  const items =
                    d.checked === true
                      ? [...new Set([...current, item.shortId])]
                      : current.filter((id) => id !== item.shortId)
                  onChange(withField(entry, "items", items.length > 0 ? items : undefined))
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label>
                  {item.emoji} {item.name}
                </Checkbox.Label>
              </Checkbox.Root>
            )
          })}
          {!entry.items ? (
            <Text fontSize="xs" color="fg.muted">
              Defaults to items that fix a {EVENT_FAMILY_LABELS[family]}.
            </Text>
          ) : null}
        </HStack>
      ) : null}
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="2">
        {entry.kind === "fund" ? (
          <Field.Root>
            <Field.Label fontSize="xs">Purpose</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={entry.purpose}
                onChange={(e) =>
                  onChange({ ...entry, purpose: incidentFundPurposeSchema.parse(e.target.value) })
                }
              >
                {incidentFundPurposeSchema.options.map((purpose) => (
                  <option key={purpose} value={purpose}>
                    {FUND_PURPOSE_LABELS[purpose]}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
        ) : null}
        {fields.numbers.map((field) => (
          <Field.Root key={field.key}>
            <Field.Label fontSize="xs">{field.label}</Field.Label>
            <Input
              size="sm"
              type="number"
              step={field.step ?? 1}
              placeholder={field.placeholder ?? "default"}
              value={(values[field.key] as number | undefined) ?? ""}
              onChange={(e) =>
                onChange(withField(entry, field.key, optionalNumber(e.target.value)))
              }
            />
          </Field.Root>
        ))}
        {fields.texts.map((field) => (
          <Field.Root key={field.key}>
            <Field.Label fontSize="xs">{field.label}</Field.Label>
            <Input
              size="sm"
              maxLength={field.maxLength}
              placeholder="default"
              value={(values[field.key] as string | undefined) ?? ""}
              onChange={(e) => onChange(withField(entry, field.key, e.target.value))}
            />
          </Field.Root>
        ))}
        {entry.kind === "fund" ? (
          <Checkbox.Root
            size="sm"
            checked={entry.waivable ?? (entry.purpose === "roadside" || entry.purpose === "tow")}
            onCheckedChange={(d) => onChange({ ...entry, waivable: d.checked === true })}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label>AAA Card covers it</Checkbox.Label>
          </Checkbox.Root>
        ) : null}
      </SimpleGrid>
    </Box>
  )
}

/** Event inspector (ADR 0220): presentation, trigger, effect, resolution chain, beats, cost. */
export function TripEventInspector({ event, estimate, walletShare, onChange, onRemove }: Props) {
  const fuel = eventTrigger(event) === "fuel"
  const family = event.family ?? "none"
  const resolution = (event.resolution ?? []) as EventResolution[]
  const beats = (event.beats ?? []) as EventBeat[]

  const setResolution = (next: EventResolution[]) =>
    onChange({ resolution: next.length > 0 ? next : undefined })
  const setBeats = (next: EventBeat[]) => onChange({ beats: next.length > 0 ? next : undefined })

  return (
    <Stack gap="3">
      <HStack justify="space-between">
        <Text fontWeight="semibold">
          {event.icon} {event.name}{" "}
          <Text as="span" color="fg.muted" fontSize="xs">
            ({event.id}
            {event.presetId ? ` · from ${event.presetId}` : ""})
          </Text>
        </Text>
        <Button size="xs" variant="outline" colorPalette="red" onClick={onRemove}>
          Remove
        </Button>
      </HStack>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
        <Field.Root>
          <Field.Label fontSize="xs">Name</Field.Label>
          <Input
            size="sm"
            maxLength={60}
            value={event.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Icon</Field.Label>
          <Input
            size="sm"
            maxLength={16}
            value={event.icon}
            onChange={(e) => onChange({ icon: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">{fuel ? "Trigger" : "Mile"}</Field.Label>
          {fuel ? (
            <Input size="sm" disabled value="When the tank runs dry" />
          ) : (
            <Input
              size="sm"
              type="number"
              step="0.1"
              value={event.mile ?? ""}
              onChange={(e) => onChange({ mile: optionalNumber(e.target.value) })}
            />
          )}
        </Field.Root>
      </SimpleGrid>

      <Field.Root>
        <Field.Label fontSize="xs">Narrative</Field.Label>
        <Textarea
          size="sm"
          rows={3}
          maxLength={2000}
          value={event.narrative ?? ""}
          onChange={(e) =>
            onChange({ narrative: e.target.value.trim() ? e.target.value : undefined })
          }
        />
        <Field.HelperText fontSize="xs">
          Posted in chat when the event starts. The road sign still shows the name and the fix.
        </Field.HelperText>
      </Field.Root>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
        <Field.Root>
          <Field.Label fontSize="xs">System message</Field.Label>
          <VariantSelect
            value={event.narrativeVariant}
            onChange={(narrativeVariant) => onChange({ narrativeVariant })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Cleared sign (blank = back on the road)</Field.Label>
          <Input
            size="sm"
            maxLength={500}
            value={event.clearedNarrative ?? ""}
            onChange={(e) => onChange({ clearedNarrative: e.target.value || undefined })}
          />
        </Field.Root>
      </SimpleGrid>

      <Box borderWidth="1px" borderRadius="md" p="3">
        <Text fontSize="sm" fontWeight="semibold" mb="2">
          Effect
        </Text>
        <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
          <Field.Root>
            <Field.Label fontSize="xs">Family (parts and items)</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={family}
                onChange={(e) => {
                  const next = eventFamily(e.target.value)
                  onChange({ family: next === "none" ? undefined : next })
                }}
              >
                {EVENT_FAMILIES.map((f) => (
                  <option key={f} value={f}>
                    {f === "none" ? "None" : EVENT_FAMILY_LABELS[f]}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Effect</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={event.effect?.kind ?? ""}
                onChange={(e) => {
                  const kind = e.target.value
                  onChange({
                    effect:
                      kind === "slow"
                        ? { kind: "slow", factor: 0.5 }
                        : kind === "stop"
                          ? { kind: "stop" }
                          : undefined,
                  })
                }}
              >
                <option value="">Narrative only</option>
                <option value="slow">Slow down</option>
                <option value="stop">Stop the van</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          {event.effect?.kind === "slow" ? (
            <Field.Root>
              <Field.Label fontSize="xs">Duration minutes</Field.Label>
              <Input
                size="sm"
                type="number"
                step="0.5"
                value={event.durationMinutes ?? ""}
                onChange={(e) => onChange({ durationMinutes: optionalNumber(e.target.value) })}
              />
            </Field.Root>
          ) : null}
        </SimpleGrid>
        {event.effect?.kind === "slow" ? (
          <SimpleGrid columns={{ base: 1, md: 2 }} gap="3" mt="3">
            <Field.Root>
              <Field.Label fontSize="xs">Speed factor (0–1)</Field.Label>
              <Input
                size="sm"
                type="number"
                step="0.05"
                min={0.05}
                max={0.95}
                value={event.effect.factor}
                onChange={(e) => {
                  if (event.effect?.kind !== "slow") return
                  onChange({ effect: { ...event.effect, factor: Number(e.target.value) } })
                }}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">Step label</Field.Label>
              <Input
                size="sm"
                maxLength={60}
                placeholder="default"
                value={event.effect.label ?? ""}
                onChange={(e) => {
                  if (event.effect?.kind !== "slow") return
                  onChange({ effect: withField(event.effect, "label", e.target.value) })
                }}
              />
            </Field.Root>
          </SimpleGrid>
        ) : null}
      </Box>

      {event.effect ? (
        <Box borderWidth="1px" borderRadius="md" p="3">
          <Text fontSize="sm" fontWeight="semibold" mb="2">
            Resolution
          </Text>
          <Stack gap="2">
            {resolution.map((entry, index) => (
              <ResolutionEntry
                key={`${entry.kind}-${index}`}
                entry={entry}
                family={family}
                onChange={(next) =>
                  setResolution(resolution.map((e, i) => (i === index ? next : e)))
                }
                onRemove={() => setResolution(resolution.filter((_, i) => i !== index))}
                onMoveUp={
                  index > 0
                    ? () => {
                        const next = [...resolution]
                        ;[next[index - 1], next[index]] = [next[index]!, next[index - 1]!]
                        setResolution(next)
                      }
                    : undefined
                }
              />
            ))}
            <HStack gap="1" flexWrap="wrap">
              {(Object.keys(RESOLUTION_LABELS) as ResolutionKind[]).map((kind) => (
                <Button
                  key={kind}
                  size="xs"
                  variant="subtle"
                  disabled={resolution.length >= 8}
                  onClick={() => setResolution([...resolution, NEW_RESOLUTION[kind]])}
                >
                  + {RESOLUTION_LABELS[kind]}
                </Button>
              ))}
            </HStack>
            {estimate ? (
              <Text fontSize="xs" color="fg.muted">
                {estimate.lines.length > 0
                  ? `${estimate.lines.map((l) => `${FUND_PURPOSE_LABELS[l.purpose]} ${l.cost}${l.waivable ? " (AAA covers)" : ""}`).join(" + ")} = ${estimate.total} coins (${walletShare(estimate.total)})`
                  : "No cost (items or a wait only)"}
              </Text>
            ) : null}
          </Stack>
        </Box>
      ) : null}

      <Box borderWidth="1px" borderRadius="md" p="3">
        <Text fontSize="sm" fontWeight="semibold" mb="2">
          Narrative Beats
        </Text>
        <Stack gap="2">
          {beats.map((beat, index) => (
            <HStack key={index} align="start" gap="2">
              <Field.Root maxW="100px">
                <Field.Label fontSize="xs">At minute</Field.Label>
                <Input
                  size="sm"
                  type="number"
                  step="0.5"
                  value={beat.atMinutes}
                  onChange={(e) =>
                    setBeats(
                      beats.map((b, i) =>
                        i === index ? { ...b, atMinutes: Number(e.target.value) } : b,
                      ),
                    )
                  }
                />
              </Field.Root>
              <Field.Root flex="1">
                <Field.Label fontSize="xs">Narrative</Field.Label>
                <Input
                  size="sm"
                  maxLength={2000}
                  value={beat.narrative}
                  onChange={(e) =>
                    setBeats(
                      beats.map((b, i) => (i === index ? { ...b, narrative: e.target.value } : b)),
                    )
                  }
                />
              </Field.Root>
              <Field.Root maxW="140px">
                <Field.Label fontSize="xs">Style</Field.Label>
                <VariantSelect
                  value={beat.narrativeVariant}
                  onChange={(narrativeVariant) =>
                    setBeats(
                      beats.map((b, i) =>
                        i === index ? withField(b, "narrativeVariant", narrativeVariant) : b,
                      ),
                    )
                  }
                />
              </Field.Root>
              <Button
                size="xs"
                variant="ghost"
                colorPalette="red"
                mt="6"
                onClick={() => setBeats(beats.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </HStack>
          ))}
          <Button
            size="xs"
            variant="subtle"
            alignSelf="start"
            disabled={beats.length >= 8}
            onClick={() => {
              const last = beats.at(-1)?.atMinutes ?? 0
              setBeats([...beats, { atMinutes: last + 1, narrative: "Still waiting." }])
            }}
          >
            + Beat
          </Button>
          <Text fontSize="xs" color="fg.muted">
            Posted in chat this many minutes after the event starts, unless it has cleared.
          </Text>
        </Stack>
      </Box>
    </Stack>
  )
}
