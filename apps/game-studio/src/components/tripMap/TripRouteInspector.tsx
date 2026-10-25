import {
  Button,
  Checkbox,
  Field,
  HStack,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
} from "@chakra-ui/react"
import { MAIN_ROUTE_ID, type TripMapInput } from "@repo/road-trip-map"
import { routeLengthOf, routeOptions, type TripRouteDraft } from "../../tripMap/branchesDraft"

type Props = {
  draft: TripMapInput
  route: TripRouteDraft
  onChange: (patch: Partial<TripRouteDraft>) => void
  onRemove: () => void
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function round1(value: number): string {
  return (Math.round(value * 10) / 10).toString()
}

/** Alternate route inspector (ADR 0222): where it forks, how it ends, and how the van takes it. */
export function TripRouteInspector({ draft, route, onChange, onRemove }: Props) {
  const parent = route.from.route ?? MAIN_ROUTE_ID
  const length = routeLengthOf(draft, route.id)
  const others = routeOptions(draft).filter((option) => option.id !== route.id)
  const rejoin = route.end.kind === "rejoin" ? route.end : null
  const target = rejoin ? (rejoin.route ?? parent) : null
  const skipped = rejoin && target === parent ? rejoin.mile - route.from.mile : null
  const vote = route.entry.kind === "vote" ? route.entry : null

  return (
    <Stack gap="3">
      <HStack justify="space-between">
        <Text fontWeight="semibold">
          {route.icon ?? "🛣️"} {route.name}{" "}
          <Text as="span" color="fg.muted" fontSize="xs">
            ({route.id} · {round1(length)} mi)
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
            value={route.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Icon</Field.Label>
          <Input
            size="sm"
            maxLength={16}
            value={route.icon ?? ""}
            onChange={(e) => onChange({ icon: e.target.value || undefined })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Drive minutes</Field.Label>
          <Input
            size="sm"
            type="number"
            step="0.5"
            value={route.driveMinutes}
            onChange={(e) => onChange({ driveMinutes: Number(e.target.value) })}
          />
        </Field.Root>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
        <Field.Root>
          <Field.Label fontSize="xs">Forks off</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={parent}
              onChange={(e) =>
                onChange({
                  from: {
                    mile: route.from.mile,
                    ...(e.target.value === MAIN_ROUTE_ID ? {} : { route: e.target.value }),
                  },
                })
              }
            >
              {others.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">At mile</Field.Label>
          <Input
            size="sm"
            type="number"
            step="0.1"
            value={route.from.mile}
            onChange={(e) => onChange({ from: { ...route.from, mile: Number(e.target.value) } })}
          />
        </Field.Root>
      </SimpleGrid>

      <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
        <Field.Root>
          <Field.Label fontSize="xs">Ends</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={route.end.kind}
              onChange={(e) =>
                onChange({
                  end:
                    e.target.value === "destination"
                      ? { kind: "destination" }
                      : { kind: "rejoin", mile: route.from.mile },
                })
              }
            >
              <option value="rejoin">Rejoins a road</option>
              <option value="destination">At its own destination</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        {rejoin ? (
          <>
            <Field.Root>
              <Field.Label fontSize="xs">Rejoins</Field.Label>
              <NativeSelect.Root size="sm">
                <NativeSelect.Field
                  value={target ?? parent}
                  onChange={(e) =>
                    onChange({
                      end: {
                        kind: "rejoin",
                        mile: rejoin.mile,
                        ...(e.target.value === parent ? {} : { route: e.target.value }),
                      },
                    })
                  }
                >
                  {others.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">At mile</Field.Label>
              <Input
                size="sm"
                type="number"
                step="0.1"
                value={rejoin.mile}
                onChange={(e) => onChange({ end: { ...rejoin, mile: Number(e.target.value) } })}
              />
            </Field.Root>
          </>
        ) : (
          <Text fontSize="xs" color="fg.muted" gridColumn={{ md: "span 2" }} alignSelf="center">
            Put one site with role "destination" on this route; it pins to the route's end.
          </Text>
        )}
      </SimpleGrid>
      {skipped !== null ? (
        <Text fontSize="xs" color="fg.muted">
          {skipped === 0
            ? `A detour that returns to its fork: +${round1(length)} mi.`
            : `Replaces ${round1(skipped)} mi of road with ${round1(length)} mi (${length < skipped ? "shorter" : "longer"} by ${round1(Math.abs(length - skipped))} mi). Stops in between are bypassed.`}
        </Text>
      ) : null}

      <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
        <Field.Root>
          <Field.Label fontSize="xs">How the van takes it</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={route.entry.kind}
              onChange={(e) =>
                onChange({
                  entry:
                    e.target.value === "outcome"
                      ? { kind: "outcome" }
                      : { kind: "vote", default: "stay" },
                })
              }
            >
              <option value="vote">The room votes at the junction</option>
              <option value="outcome">Only when something diverts to it</option>
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Fork exists while</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={route.layer ?? ""}
              onChange={(e) => onChange({ layer: e.target.value || undefined })}
            >
              <option value="">Always</option>
              {(draft.layers ?? []).map((layer) => (
                <option key={layer.id} value={layer.id}>
                  {layer.icon} {layer.name} is unlocked
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        {vote ? (
          <Field.Root>
            <Field.Label fontSize="xs">No votes =</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={vote.default ?? "stay"}
                onChange={(e) =>
                  onChange({ entry: { ...vote, default: e.target.value as "take" | "stay" } })
                }
              >
                <option value="stay">Stay on the road</option>
                <option value="take">Take it</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
        ) : null}
      </SimpleGrid>
      {vote ? (
        <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
          <Field.Root gridColumn={{ md: "span 2" }}>
            <Field.Label fontSize="xs">Question (blank = default)</Field.Label>
            <Input
              size="sm"
              maxLength={120}
              placeholder={`${route.name} in 2 miles: take it?`}
              value={vote.question ?? ""}
              onChange={(e) =>
                onChange({ entry: { ...vote, question: e.target.value || undefined } })
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Lead minutes</Field.Label>
            <Input
              size="sm"
              type="number"
              step="0.5"
              placeholder="default"
              value={vote.leadMinutes ?? ""}
              onChange={(e) =>
                onChange({ entry: { ...vote, leadMinutes: optionalNumber(e.target.value) } })
              }
            />
          </Field.Root>
          <Checkbox.Root
            size="sm"
            checked={vote.mystery === true}
            onCheckedChange={(d) =>
              onChange({ entry: { ...vote, mystery: d.checked === true || undefined } })
            }
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label>Mystery (the vote doesn't name it)</Checkbox.Label>
          </Checkbox.Root>
        </SimpleGrid>
      ) : null}
      <Text fontSize="xs" color="fg.muted">
        Until the vote resolves, the trip plans as if the van stays on the road; the room never sees
        this route's stops early.
      </Text>
    </Stack>
  )
}
