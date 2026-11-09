import {
  Box,
  Button,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react"
import {
  GIVE_ITEM_MAX_QTY,
  MAIN_ROUTE_ID,
  roadTripItemId,
  tripKeyIdForDefinition,
  VAN_ITEM_IDS,
  type TripCondition,
  type TripMapInput,
  type TripOutcome,
} from "@repo/road-trip-map"
import { routeOptions } from "../../tripMap/branchesDraft"
import { offerCatalogFor } from "../../tripMap/tripMapDraft"
import { TripConditionField } from "./TripConditionField"

/**
 * Shared trip-branch fields (ADR 0222, 0230): which route and layer a site or
 * event is on, and an outcomes list.
 */

const OUTCOME_LABELS: Record<TripOutcome["kind"], string> = {
  unlock: "Unlock layer",
  lock: "Lock layer",
  divert: "Divert to route",
  "give-key": "Give key item",
  "take-key": "Take key item",
  "give-item": "Give item",
}

function Select({
  value,
  options,
  onChange,
}: {
  value: string
  options: { id: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <NativeSelect.Root size="sm">
      <NativeSelect.Field value={value} onChange={(e) => onChange(e.target.value)}>
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

function layerOptions(draft: TripMapInput): { id: string; label: string }[] {
  return (draft.layers ?? []).map((layer) => ({
    id: layer.id,
    label: `${layer.icon} ${layer.name}`,
  }))
}

function altRouteOptions(draft: TripMapInput): { id: string; label: string }[] {
  return routeOptions(draft).filter((option) => option.id !== MAIN_ROUTE_ID)
}

function keyChoices(draft: TripMapInput): { id: string; name: string }[] {
  return (draft.keyItems ?? []).map((key) => ({ id: key.id, name: key.name }))
}

function withWhen(outcome: TripOutcome, when: TripCondition | undefined): TripOutcome {
  if (when) return { ...outcome, when }
  const { when: _when, ...rest } = outcome
  return rest
}

/** A blank outcome of `kind`, aimed at the first layer, route, key, or item there is. */
function newOutcome(draft: TripMapInput, kind: TripOutcome["kind"]): TripOutcome | null {
  if (kind === "divert") {
    const route = draft.routes?.[0]
    return route ? { kind, route: route.id } : null
  }
  if (kind === "unlock" || kind === "lock") {
    const layer = draft.layers?.[0]
    return layer ? { kind, layer: layer.id } : null
  }
  if (kind === "give-key" || kind === "take-key") {
    const key = draft.keyItems?.[0]
    return key ? { kind, key: key.id } : null
  }
  return { kind: "give-item", item: roadTripItemId(VAN_ITEM_IDS.tripGuide), to: "everyone", qty: 1 }
}

export function TripOutcomesEditor({
  draft,
  label,
  helper,
  outcomes,
  onChange,
}: {
  draft: TripMapInput
  label: string
  helper: string
  outcomes: TripOutcome[]
  onChange: (outcomes: TripOutcome[] | undefined) => void
}) {
  const set = (next: TripOutcome[]) => onChange(next.length > 0 ? next : undefined)
  const kinds = (Object.keys(OUTCOME_LABELS) as TripOutcome["kind"][]).filter(
    (kind) => newOutcome(draft, kind) !== null,
  )
  const keys = keyChoices(draft)
  const items = offerCatalogFor(draft).filter(
    (option) => tripKeyIdForDefinition(option.definitionId) === undefined,
  )
  const replace = (index: number, next: TripOutcome) =>
    set(outcomes.map((outcome, i) => (i === index ? next : outcome)))
  return (
    <Stack gap="2">
      <Text fontSize="xs" fontWeight="semibold">
        {label}
      </Text>
      {outcomes.map((outcome, index) => {
        const rowKinds = kinds.includes(outcome.kind) ? kinds : [outcome.kind, ...kinds]
        return (
          <Stack key={index} gap="2" borderWidth="1px" borderRadius="md" p="2">
            <HStack gap="2" align="start">
              <Box flex="1">
                <Select
                  value={outcome.kind}
                  options={rowKinds.map((kind) => ({ id: kind, label: OUTCOME_LABELS[kind] }))}
                  onChange={(kind) => {
                    const fresh = newOutcome(draft, kind as TripOutcome["kind"])
                    if (fresh)
                      replace(index, outcome.when ? { ...fresh, when: outcome.when } : fresh)
                  }}
                />
              </Box>
              <Box flex="1">
                {outcome.kind === "divert" ? (
                  <Select
                    value={outcome.route}
                    options={altRouteOptions(draft)}
                    onChange={(route) => replace(index, { ...outcome, route })}
                  />
                ) : outcome.kind === "unlock" || outcome.kind === "lock" ? (
                  <Select
                    value={outcome.layer}
                    options={layerOptions(draft)}
                    onChange={(layer) => replace(index, { ...outcome, layer })}
                  />
                ) : outcome.kind === "give-key" || outcome.kind === "take-key" ? (
                  <Select
                    value={outcome.key}
                    options={keys.map((key) => ({ id: key.id, label: key.name }))}
                    onChange={(key) => replace(index, { ...outcome, key })}
                  />
                ) : (
                  <Select
                    value={outcome.item}
                    options={[
                      ...(!items.some((item) => item.definitionId === outcome.item)
                        ? [{ id: outcome.item, label: outcome.item }]
                        : []),
                      ...items.map((item) => ({
                        id: item.definitionId,
                        label: `${item.icon} ${item.name}`,
                      })),
                    ]}
                    onChange={(item) => replace(index, { ...outcome, item })}
                  />
                )}
              </Box>
              <Button
                size="2xs"
                variant="ghost"
                colorPalette="red"
                onClick={() => set(outcomes.filter((_, i) => i !== index))}
              >
                Remove
              </Button>
            </HStack>
            {outcome.kind === "give-item" ? (
              <HStack gap="2">
                <Box flex="1">
                  <Select
                    value={outcome.to}
                    options={[
                      { id: "everyone", label: "Everyone online" },
                      { id: "random", label: "One traveler" },
                    ]}
                    onChange={(to) =>
                      replace(index, { ...outcome, to: to === "random" ? "random" : "everyone" })
                    }
                  />
                </Box>
                <Input
                  size="sm"
                  type="number"
                  min={1}
                  max={GIVE_ITEM_MAX_QTY}
                  maxW="80px"
                  aria-label="How many"
                  value={outcome.qty ?? 1}
                  onChange={(event) => {
                    const n = Math.round(Number(event.target.value))
                    if (!Number.isFinite(n)) return
                    replace(index, {
                      ...outcome,
                      qty: Math.min(GIVE_ITEM_MAX_QTY, Math.max(1, n)),
                    })
                  }}
                />
              </HStack>
            ) : null}
            {outcome.kind === "give-key" ? (
              <Input
                size="sm"
                maxLength={2000}
                placeholder="Found narrative (or the key's own)"
                aria-label="Found narrative"
                value={outcome.narrative ?? ""}
                onChange={(event) => {
                  const narrative = event.target.value.trim() ? event.target.value : undefined
                  if (narrative) {
                    replace(index, { ...outcome, narrative })
                    return
                  }
                  const { narrative: _drop, ...rest } = outcome
                  replace(index, rest)
                }}
              />
            ) : null}
            <TripConditionField
              when={outcome.when}
              keys={keys}
              onChange={(when) => replace(index, withWhen(outcome, when))}
            />
          </Stack>
        )
      })}
      {kinds.length > 0 ? (
        <HStack gap="1" flexWrap="wrap">
          {kinds.map((kind) => (
            <Button
              key={kind}
              size="xs"
              variant="subtle"
              disabled={outcomes.length >= 8}
              onClick={() => {
                const fresh = newOutcome(draft, kind)
                if (fresh) set([...outcomes, fresh])
              }}
            >
              + {OUTCOME_LABELS[kind]}
            </Button>
          ))}
        </HStack>
      ) : null}
      <Text fontSize="xs" color="fg.muted">
        {kinds.length > 0
          ? helper
          : "Add a layer, an alternate route, or a key item to give this outcomes."}
        {outcomes.some((outcome) => outcome.when)
          ? " A condition is checked as this list starts, so a key given here doesn't satisfy a later one."
          : ""}
      </Text>
    </Stack>
  )
}

/** Route and layer selects for a site or event. Miles stay local to the chosen route. */
export function TripPlacementFields({
  draft,
  route,
  layer,
  onChange,
}: {
  draft: TripMapInput
  route: string | undefined
  layer: string | undefined
  /** Always both fields; `undefined` clears one. */
  onChange: (placement: { route: string | undefined; layer: string | undefined }) => void
}) {
  if (!draft.routes?.length && !draft.layers?.length) return null
  return (
    <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
      {draft.routes?.length ? (
        <Field.Root>
          <Field.Label fontSize="xs">Route</Field.Label>
          <Select
            value={route ?? MAIN_ROUTE_ID}
            options={routeOptions(draft)}
            onChange={(next) =>
              onChange({ route: next === MAIN_ROUTE_ID ? undefined : next, layer })
            }
          />
          <Field.HelperText fontSize="xs">The mile is counted along this route.</Field.HelperText>
        </Field.Root>
      ) : null}
      {draft.layers?.length ? (
        <Field.Root>
          <Field.Label fontSize="xs">Layer</Field.Label>
          <Select
            value={layer ?? ""}
            options={[{ id: "", label: "Always on the map" }, ...layerOptions(draft)]}
            onChange={(next) => onChange({ route, layer: next || undefined })}
          />
          <Field.HelperText fontSize="xs">
            Inert until something unlocks the layer.
          </Field.HelperText>
        </Field.Root>
      ) : null}
    </SimpleGrid>
  )
}
