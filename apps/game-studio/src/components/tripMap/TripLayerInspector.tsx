import { Button, Checkbox, Field, HStack, Input, SimpleGrid, Stack, Text } from "@chakra-ui/react"
import type { TripFlowLayer } from "@repo/road-trip-map"
import type { TripLayerDraft, TripMapItemDraft } from "../../tripMap/branchesDraft"

type Props = {
  layer: TripLayerDraft
  /** The trip's maps; the layer opts into the ones that reveal it (ADR 0227). */
  maps: TripMapItemDraft[]
  /** What the flow outline knows about it (null while the draft doesn't parse). */
  outline: TripFlowLayer | null
  onChange: (patch: Partial<TripLayerDraft>) => void
  onRemove: () => void
}

function list(names: string[], none: string): string {
  return names.length > 0 ? names.join(", ") : none
}

/** Layer inspector (ADR 0222): a named group of stops that stay hidden until unlocked. */
export function TripLayerInspector({ layer, maps, outline, onChange, onRemove }: Props) {
  const optedIn = layer.maps ?? []
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
      {maps.length > 0 ? (
        <HStack gap="3" flexWrap="wrap">
          {maps.map((item) => (
            <Checkbox.Root
              key={item.id}
              size="sm"
              checked={optedIn.includes(item.id)}
              onCheckedChange={(d) => {
                const next =
                  d.checked === true
                    ? [...optedIn, item.id]
                    : optedIn.filter((id) => id !== item.id)
                onChange({ maps: next.length > 0 ? next : undefined })
              }}
            >
              <Checkbox.HiddenInput />
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Label>
                {item.icon ?? "🗺️"} {item.name} reveals it
              </Checkbox.Label>
            </Checkbox.Root>
          ))}
        </HStack>
      ) : (
        <Text fontSize="xs" color="fg.muted">
          Add a Map to sell one that reveals this layer.
        </Text>
      )}
      {outline ? (
        <Stack gap="1" fontSize="xs">
          <Text>Unlocked by: {list([...outline.unlockedBy, ...outline.maps], "nothing yet")}</Text>
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
