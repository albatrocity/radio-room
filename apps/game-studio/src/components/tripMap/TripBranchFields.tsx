import { Box, Button, Field, HStack, NativeSelect, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import { MAIN_ROUTE_ID, type TripMapInput, type TripOutcome } from "@repo/road-trip-map"
import { routeOptions } from "../../tripMap/branchesDraft"

/**
 * Shared trip-branch fields (ADR 0222): which route and layer a site or event
 * is on, and an outcomes list (unlock / lock a layer, divert to a route).
 */

const OUTCOME_LABELS: Record<TripOutcome["kind"], string> = {
  unlock: "Unlock layer",
  lock: "Lock layer",
  divert: "Divert to route",
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

/** A blank outcome of `kind`, aimed at the first layer or route there is. */
function newOutcome(draft: TripMapInput, kind: TripOutcome["kind"]): TripOutcome | null {
  if (kind === "divert") {
    const route = draft.routes?.[0]
    return route ? { kind, route: route.id } : null
  }
  const layer = draft.layers?.[0]
  return layer ? { kind, layer: layer.id } : null
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
  return (
    <Stack gap="2">
      <Text fontSize="xs" fontWeight="semibold">
        {label}
      </Text>
      {outcomes.map((outcome, index) => (
        <HStack key={index} gap="2">
          <Box flex="1">
            <Select
              value={outcome.kind}
              options={kinds.map((kind) => ({ id: kind, label: OUTCOME_LABELS[kind] }))}
              onChange={(kind) => {
                const fresh = newOutcome(draft, kind as TripOutcome["kind"])
                if (fresh) set(outcomes.map((o, i) => (i === index ? fresh : o)))
              }}
            />
          </Box>
          <Box flex="1">
            {outcome.kind === "divert" ? (
              <Select
                value={outcome.route}
                options={altRouteOptions(draft)}
                onChange={(route) =>
                  set(outcomes.map((o, i) => (i === index ? { kind: "divert", route } : o)))
                }
              />
            ) : (
              <Select
                value={outcome.layer}
                options={layerOptions(draft)}
                onChange={(layer) =>
                  set(outcomes.map((o, i) => (i === index ? { kind: outcome.kind, layer } : o)))
                }
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
      ))}
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
        {kinds.length > 0 ? helper : "Add a layer or an alternate route to give this outcomes."}
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
