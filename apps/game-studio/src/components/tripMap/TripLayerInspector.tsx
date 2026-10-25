import { Button, Checkbox, Field, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import { TRIP_GUIDE_ITEMS, type TripFlowLayer } from "@repo/road-trip-map"
import type { TripLayerDraft } from "../../tripMap/branchesDraft"

type Props = {
  layer: TripLayerDraft
  /** What the flow outline knows about it (null while the draft doesn't parse). */
  outline: TripFlowLayer | null
  onChange: (patch: Partial<TripLayerDraft>) => void
  onRemove: () => void
}

const UNLOCK_ITEMS = TRIP_GUIDE_ITEMS.filter((item) => item.effect === "unlock-layer")

function list(names: string[], none: string): string {
  return names.length > 0 ? names.join(", ") : none
}

/** Layer inspector (ADR 0222): a named group of stops that stay hidden until unlocked. */
export function TripLayerInspector({ layer, outline, onChange, onRemove }: Props) {
  const items = layer.unlockItems ?? []
  return (
    <Stack gap="3">
      <HStack justify="space-between">
        <Text fontWeight="semibold">
          {layer.icon} {layer.name}{" "}
          <Text as="span" color="fg.muted" fontSize="xs">
            ({layer.id} · layer)
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
            value={layer.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Icon</Field.Label>
          <Input
            size="sm"
            maxLength={16}
            value={layer.icon}
            onChange={(e) => onChange({ icon: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Sign when it unlocks</Field.Label>
          <Input
            size="sm"
            maxLength={500}
            placeholder="New stops are on the map."
            value={layer.unlockedNarrative ?? ""}
            onChange={(e) => onChange({ unlockedNarrative: e.target.value || undefined })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Sign when it locks</Field.Label>
          <Input
            size="sm"
            maxLength={500}
            placeholder="Those stops are off the map."
            value={layer.lockedNarrative ?? ""}
            onChange={(e) => onChange({ lockedNarrative: e.target.value || undefined })}
          />
        </Field.Root>
      </SimpleGrid>
      <HStack gap="3" flexWrap="wrap">
        {UNLOCK_ITEMS.map((item) => (
          <Checkbox.Root
            key={item.shortId}
            size="sm"
            checked={items.includes(item.shortId)}
            onCheckedChange={(d) => {
              const next =
                d.checked === true
                  ? [...items, item.shortId]
                  : items.filter((id) => id !== item.shortId)
              onChange({ unlockItems: next.length > 0 ? next : undefined })
            }}
          >
            <Checkbox.HiddenInput />
            <Checkbox.Control>
              <Checkbox.Indicator />
            </Checkbox.Control>
            <Checkbox.Label>
              {item.emoji} {item.name} unlocks it
            </Checkbox.Label>
          </Checkbox.Root>
        ))}
      </HStack>
      {outline ? (
        <Stack gap="1" fontSize="xs">
          <Text>Unlocked by: {list([...outline.unlockedBy, ...outline.items], "nothing yet")}</Text>
          <Text>Locked by: {list(outline.lockedBy, "nothing")}</Text>
          <Text>Stops: {list(outline.sites, "none")}</Text>
          <Text>Events: {list(outline.events, "none")}</Text>
          {outline.forks.length > 0 ? (
            <Text>Forks it opens: {outline.forks.join(", ")}</Text>
          ) : null}
        </Stack>
      ) : null}
      <Text fontSize="xs" color="fg.muted">
        Put stops and events in this layer from their inspectors. Anything the van has already
        passed when the layer unlocks is missed; a stop the room already chose survives a lock.
      </Text>
    </Stack>
  )
}
