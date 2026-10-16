import { Badge, Box, Button, Checkbox, Field, HStack, Input, NativeSelect, Stack, Text } from "@chakra-ui/react"
import type { SiteShopOffer } from "@repo/road-trip-map"
import { useState } from "react"
import {
  OFFER_CATALOG,
  OFFER_POOL_CAP,
  OFFER_SHELF_CAP,
  previewOfferSample,
  type OfferOption,
} from "../../tripMap/tripMapDraft"

const PLUGIN_LABEL: Record<OfferOption["plugin"], string> = {
  "item-shops": "Item Shops",
  "road-trip": "Road trip",
}

const PLUGINS: OfferOption["plugin"][] = ["item-shops", "road-trip"]

type ShopSample = { count: number; weights?: "rarity" | "even" }

type Props = {
  offers: SiteShopOffer[]
  sample?: ShopSample
  onChange: (offers: SiteShopOffer[]) => void
  onSampleChange: (sample: ShopSample | undefined) => void
}

/** mulberry32. A new seed on each preview click rolls a different traveler. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function storedOffer(offer: SiteShopOffer): SiteShopOffer {
  const next: SiteShopOffer = { definitionId: offer.definitionId }
  if (offer.basePrice != null) next.basePrice = offer.basePrice
  if (offer.stock != null && offer.stock > 1) next.stock = offer.stock
  return next
}

function roomChip(roomTypes: NonNullable<OfferOption["roomTypes"]>): string {
  return roomTypes.length === 1 ? `${roomTypes[0]} only` : roomTypes.join(", ")
}

function ToggleSample({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <Checkbox.Root size="sm" checked={checked} onCheckedChange={(d) => onChange(d.checked === true)}>
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label fontSize="xs">Show N random picks per traveler</Checkbox.Label>
    </Checkbox.Root>
  )
}

function OfferChips({ option }: { option: OfferOption }) {
  return (
    <HStack gap="1" flexWrap="wrap">
      <Badge size="sm" variant="outline">
        {option.rarity}
      </Badge>
      {option.roomTypes ? (
        <Badge size="sm" colorPalette="orange" variant="subtle">
          {roomChip(option.roomTypes)}
        </Badge>
      ) : null}
      {option.decorated === "condition" ? (
        <Badge size="sm" colorPalette="purple" variant="subtle">
          price varies by condition
        </Badge>
      ) : null}
    </HStack>
  )
}

/** Selected shelf plus a search over every item Item Shops can sell. */
export function TripOfferPicker({ offers, sample, onChange, onSampleChange }: Props) {
  const [query, setQuery] = useState("")
  const [preview, setPreview] = useState<string[] | null>(null)
  const cap = sample ? OFFER_POOL_CAP : OFFER_SHELF_CAP
  const atCap = offers.length >= cap
  const selectedIds = new Set(offers.map((offer) => offer.definitionId))
  const q = query.trim().toLowerCase()
  const matches = OFFER_CATALOG.filter((option) => {
    if (selectedIds.has(option.definitionId)) return false
    if (!q) return true
    return option.name.toLowerCase().includes(q) || option.definitionId.toLowerCase().includes(q)
  })

  const patchAt = (index: number, patch: Partial<SiteShopOffer>) => {
    onChange(offers.map((offer, i) => (i === index ? storedOffer({ ...offer, ...patch }) : offer)))
  }

  return (
    <Stack gap="2">
      <HStack justify="space-between">
        <Text fontSize="xs" fontWeight="semibold" color="fg.muted">
          {sample ? "Custom offers (a pool; each traveler sees a sample)" : "Custom offers (always on the shelf)"}
        </Text>
        <Text fontSize="xs" color={atCap ? "orange.fg" : "fg.muted"}>
          {offers.length} / {cap}
        </Text>
      </HStack>
      <HStack gap="3" align="end" flexWrap="wrap">
        <Box>
          <ToggleSample
            checked={sample != null}
            onChange={(on) => {
              setPreview(null)
              onSampleChange(on ? { count: Math.min(3, Math.max(1, offers.length || 1)), weights: "rarity" } : undefined)
            }}
          />
        </Box>
        {sample ? (
          <>
            <Field.Root maxW="90px">
              <Field.Label fontSize="xs">Picks</Field.Label>
              <Input
                size="xs"
                type="number"
                min={1}
                max={8}
                value={sample.count}
                onChange={(e) => {
                  const n = Number(e.target.value)
                  if (!Number.isFinite(n)) return
                  setPreview(null)
                  onSampleChange({ ...sample, count: Math.min(8, Math.max(1, Math.round(n))) })
                }}
              />
            </Field.Root>
            <Field.Root maxW="140px">
              <Field.Label fontSize="xs">Weights</Field.Label>
              <NativeSelect.Root size="xs">
                <NativeSelect.Field
                  value={sample.weights ?? "rarity"}
                  onChange={(e) => {
                    setPreview(null)
                    onSampleChange({
                      ...sample,
                      weights: e.target.value === "even" ? "even" : "rarity",
                    })
                  }}
                >
                  <option value="rarity">By rarity</option>
                  <option value="even">Even</option>
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            </Field.Root>
            <Button
              size="xs"
              variant="outline"
              disabled={offers.length === 0}
              onClick={() => setPreview(previewOfferSample(offers, sample, mulberry32(Date.now())))}
            >
              Preview a traveler
            </Button>
          </>
        ) : null}
      </HStack>
      {preview ? (
        <Text fontSize="xs" color="fg.muted">
          One traveler might see: {preview.join(", ") || "nothing"}
        </Text>
      ) : null}

      {offers.length > 0 ? (
        <Stack gap="2">
          {offers.map((offer, index) => {
            const option = OFFER_CATALOG.find((item) => item.definitionId === offer.definitionId)
            return (
              <Box key={`${offer.definitionId}:${index}`} borderWidth="1px" borderRadius="md" p="2">
                <HStack justify="space-between" align="start" gap="2">
                  <Stack gap="1" flex="1">
                    <HStack gap="2" flexWrap="wrap">
                      <Text fontSize="sm">
                        {option?.plugin === "road-trip" ? `${option.icon} ` : ""}
                        {option?.name ?? offer.definitionId}
                      </Text>
                      <Badge size="sm" variant="subtle">
                        {option ? PLUGIN_LABEL[option.plugin] : "unknown"}
                      </Badge>
                    </HStack>
                    {option ? <OfferChips option={option} /> : null}
                    {option?.outsideShopNote ? (
                      <Text fontSize="xs" color="fg.muted">
                        {option.outsideShopNote}
                      </Text>
                    ) : null}
                  </Stack>
                  <Button
                    size="xs"
                    variant="ghost"
                    colorPalette="red"
                    onClick={() => onChange(offers.filter((_, i) => i !== index))}
                  >
                    Remove
                  </Button>
                </HStack>
                <HStack gap="2" mt="2">
                  <Input
                    size="xs"
                    type="number"
                    maxW="120px"
                    aria-label={`Price for ${option?.name ?? offer.definitionId}`}
                    placeholder={option ? `${option.coinValue} coins` : "coins"}
                    value={offer.basePrice ?? ""}
                    onChange={(e) => patchAt(index, { basePrice: optionalNumber(e.target.value) })}
                  />
                  <Input
                    size="xs"
                    type="number"
                    min={1}
                    maxW="90px"
                    aria-label={`Stock for ${option?.name ?? offer.definitionId}`}
                    placeholder="1"
                    value={offer.stock ?? ""}
                    onChange={(e) => patchAt(index, { stock: optionalNumber(e.target.value) })}
                  />
                </HStack>
              </Box>
            )
          })}
        </Stack>
      ) : (
        <Text fontSize="xs" color="fg.muted">
          No offers yet. This site sells only the catalog shops selected above.
        </Text>
      )}

      <Input
        size="sm"
        placeholder="Add item — search by name or id"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search items to add"
      />
      <Box maxH="240px" overflowY="auto" borderWidth="1px" borderRadius="md" p="2">
        {matches.length === 0 ? (
          <Text fontSize="xs" color="fg.muted">
            No items match.
          </Text>
        ) : (
          <Stack gap="3">
            {PLUGINS.map((plugin) => {
              const group = matches.filter((option) => option.plugin === plugin)
              if (group.length === 0) return null
              return (
                <Stack key={plugin} gap="0">
                  <Text fontSize="xs" fontWeight="semibold" color="fg.muted" px="2" pt="1" pb="1">
                    {PLUGIN_LABEL[plugin]}
                  </Text>
                  {group.map((option) => (
                    <HStack
                      key={option.definitionId}
                      role="button"
                      tabIndex={atCap ? -1 : 0}
                      aria-label={`Add ${option.name}`}
                      aria-disabled={atCap}
                      gap="2"
                      align="center"
                      flexWrap="wrap"
                      px="2"
                      py="1.5"
                      borderTopWidth="1px"
                      borderColor="border.muted"
                      cursor={atCap ? "not-allowed" : "pointer"}
                      _hover={atCap ? undefined : { bg: "bg.muted" }}
                      onClick={() => {
                        if (!atCap) onChange([...offers, { definitionId: option.definitionId }])
                      }}
                      onKeyDown={(event) => {
                        if (atCap || (event.key !== "Enter" && event.key !== " ")) return
                        event.preventDefault()
                        onChange([...offers, { definitionId: option.definitionId }])
                      }}
                    >
                      <Text fontSize="sm">
                        {option.plugin === "road-trip" ? `${option.icon} ` : ""}
                        {option.name}
                      </Text>
                      <OfferChips option={option} />
                      {option.outsideShopNote ? (
                        <Text fontSize="xs" color="fg.muted">
                          {option.outsideShopNote}
                        </Text>
                      ) : null}
                    </HStack>
                  ))}
                </Stack>
              )
            })}
          </Stack>
        )}
      </Box>
    </Stack>
  )
}
