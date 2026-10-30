import { Button, Field, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import { roadTripItemId, tripMapItemShortId, type TripMapInput } from "@repo/road-trip-map"
import type { TripMapItemDraft } from "../../tripMap/branchesDraft"

type Props = {
  item: TripMapItemDraft
  draft: TripMapInput
  onChange: (patch: Partial<TripMapItemDraft>) => void
  onRemove: () => void
}

function list(names: string[], none: string): string {
  return names.length > 0 ? names.join(", ") : none
}

/** A map the trip sells (ADR 0227): using it unlocks every locked layer that opts in. */
export function TripMapItemInspector({ item, draft, onChange, onRemove }: Props) {
  const definitionId = roadTripItemId(tripMapItemShortId(item.id))
  const layers = (draft.layers ?? []).filter((layer) => layer.maps?.includes(item.id))
  const sellers = draft.sites.filter((site) =>
    site.shop?.offers?.some((offer) => offer.definitionId === definitionId),
  )
  return (
    <Stack gap="3">
      <HStack justify="space-between">
        <Text fontWeight="semibold">
          {item.icon ?? "🗺️"} {item.name}{" "}
          <Text as="span" color="fg.muted" fontSize="xs">
            ({definitionId} · map)
          </Text>
        </Text>
        <Button size="xs" variant="outline" colorPalette="red" onClick={onRemove}>
          Remove
        </Button>
      </HStack>
      <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
        <Field.Root>
          <Field.Label fontSize="xs">Name</Field.Label>
          <Input
            size="sm"
            maxLength={60}
            value={item.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Icon</Field.Label>
          <Input
            size="sm"
            maxLength={16}
            placeholder="🗺️"
            value={item.icon ?? ""}
            onChange={(e) => onChange({ icon: e.target.value || undefined })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Description</Field.Label>
          <Input
            size="sm"
            maxLength={160}
            placeholder="Use it on this trip to mark the spots it knows about."
            value={item.description ?? ""}
            onChange={(e) => onChange({ description: e.target.value || undefined })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Price (coins)</Field.Label>
          <Input
            size="sm"
            type="number"
            min={0}
            placeholder="25"
            value={item.coinValue ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim()
              const n = Number(raw)
              onChange({
                coinValue: raw === "" || !Number.isFinite(n) ? undefined : Math.max(0, Math.round(n)),
              })
            }}
          />
        </Field.Root>
      </SimpleGrid>
      <Stack gap="1" fontSize="xs">
        <Text>Reveals: {list(layers.map((l) => l.name), "no layers yet")}</Text>
        <Text>Sold at: {list(sellers.map((s) => s.name), "no sites yet")}</Text>
      </Stack>
      <Text fontSize="xs" color="fg.muted">
        Opt layers into this map from their inspectors, and sell it from a site's shop. Using it
        unlocks every opted-in layer that's still locked; stops the van already passed stay missed.
      </Text>
    </Stack>
  )
}
