import { Button, Field, HStack, Input, SimpleGrid, Stack, Text, Textarea } from "@chakra-ui/react"
import { tripKeyItemDefinitionId, type TripFlowKeyItem } from "@repo/road-trip-map"
import type { TripKeyItemDraft } from "../../tripMap/branchesDraft"

type Props = {
  item: TripKeyItemDraft
  /** Who gives, takes, sells, and reads it, when the draft parses. */
  outline: TripFlowKeyItem | null
  onChange: (patch: Partial<TripKeyItemDraft>) => void
  onRemove: () => void
}

function list(names: string[] | undefined, none: string): string {
  return names && names.length > 0 ? names.join(", ") : none
}

/** A key item the van holds (ADR 0230). It does nothing until a condition reads it. */
export function TripKeyItemInspector({ item, outline, onChange, onRemove }: Props) {
  return (
    <Stack gap="3">
      <HStack justify="space-between">
        <Text fontWeight="semibold">
          {item.icon ?? "🔑"} {item.name}{" "}
          <Text as="span" color="fg.muted" fontSize="xs">
            ({tripKeyItemDefinitionId(item.id)} · key)
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
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Icon</Field.Label>
          <Input
            size="sm"
            maxLength={16}
            placeholder="🔑"
            value={item.icon ?? ""}
            onChange={(event) => onChange({ icon: event.target.value || undefined })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Description</Field.Label>
          <Input
            size="sm"
            maxLength={160}
            value={item.description ?? ""}
            onChange={(event) => onChange({ description: event.target.value || undefined })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Price (coins)</Field.Label>
          <Input
            size="sm"
            type="number"
            min={0}
            placeholder="0"
            value={item.coinValue ?? ""}
            onChange={(event) => {
              const raw = event.target.value.trim()
              const n = Number(raw)
              onChange({
                coinValue:
                  raw === "" || !Number.isFinite(n) ? undefined : Math.max(0, Math.round(n)),
              })
            }}
          />
        </Field.Root>
      </SimpleGrid>
      <Field.Root>
        <Field.Label fontSize="xs">Found narrative</Field.Label>
        <Textarea
          size="sm"
          rows={3}
          maxLength={2000}
          placeholder="Posted when the key lands in the van, unless the outcome writes its own."
          value={item.foundNarrative ?? ""}
          onChange={(event) =>
            onChange({ foundNarrative: event.target.value.trim() ? event.target.value : undefined })
          }
        />
      </Field.Root>
      <Stack gap="1" fontSize="xs">
        <Text>Given by: {list(outline?.givenBy, "nothing yet")}</Text>
        <Text>Taken by: {list(outline?.takenBy, "nothing")}</Text>
        <Text>Sold at: {list(outline?.soldAt, "no site yet")}</Text>
        <Text>Read by: {list(outline?.readBy, "no condition yet")}</Text>
      </Stack>
      <Text fontSize="xs" color="fg.muted">
        The van holds this once. Giving it again does nothing. A condition is checked when its
        behavior fires, against the van as it is then — a key given in the same outcome list doesn't
        count yet.
      </Text>
    </Stack>
  )
}
