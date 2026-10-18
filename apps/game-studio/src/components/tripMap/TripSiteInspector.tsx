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
import type { ReactNode } from "react"
import {
  isDestination,
  NARRATIVE_VARIANTS,
  resolveSiteSettings,
  skipPollQuestion,
  type NarrativeVariant,
  type TripMap,
} from "@repo/road-trip-map"
import { TripOfferPicker } from "./TripOfferPicker"
import {
  SHOP_OPTIONS,
  type FuelProjectionStop,
  type TripSiteDraft,
} from "../../tripMap/tripMapDraft"

const DEFAULT_GAS_PRICE = 8

type Props = {
  site: TripSiteDraft
  resolved: TripMap | null
  /** This site's row in the no-vote fuel plan, when it sells gas. */
  gasStop?: FuelProjectionStop
  /** Image and 3D model section (`TripSiteArt`), owned by the editor's upload state. */
  art: ReactNode
  onChange: (patch: Partial<TripSiteDraft>) => void
  onRemove: () => void
}

function narrativeVariant(value: string): NarrativeVariant | undefined {
  return NARRATIVE_VARIANTS.find((variant) => variant === value)
}

function optionalNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <Checkbox.Root
      size="sm"
      checked={checked}
      onCheckedChange={(d) => onChange(d.checked === true)}
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
  )
}

/** Site inspector (M8): presentation, art, stop behavior, reveal, skip poll, services, and shop. */
export function TripSiteInspector({ site, resolved, gasStop, art, onChange, onRemove }: Props) {
  const destination = isDestination(site)
  const resolvedSite = resolved?.sites.find((s) => s.id === site.id)
  const settings = resolved && resolvedSite ? resolveSiteSettings(resolved, resolvedSite) : null
  const pollPreview =
    resolved && resolvedSite && settings?.optional
      ? skipPollQuestion(
          resolvedSite,
          (resolved.route.baseMph * settings.pollLeadMs) / 3_600_000,
          settings.mystery,
        )
      : null
  const shopIds = site.shop?.shopIds ?? []
  const offers = site.shop?.offers ?? []

  const setSkipPoll = (patch: Partial<NonNullable<TripSiteDraft["skipPoll"]>>) =>
    onChange({ skipPoll: { ...site.skipPoll, ...patch } })
  const setShop = (patch: Partial<NonNullable<TripSiteDraft["shop"]>>) => {
    const next = { ...site.shop, ...patch }
    if (next.offers?.length === 0) delete next.offers
    if (next.buybackRate == null) delete next.buybackRate
    if (next.sample == null) delete next.sample
    const empty =
      !next.shopIds?.length &&
      !next.offers &&
      next.buybackRate == null &&
      next.sample == null &&
      !next.title &&
      !next.openingMessage
    onChange({ shop: empty ? undefined : next })
  }
  const setServices = (patch: Partial<NonNullable<TripSiteDraft["services"]>>) => {
    const next: NonNullable<TripSiteDraft["services"]> = { ...site.services, ...patch }
    if (!next.gas) delete next.gas
    if (!next.mechanic) delete next.mechanic
    onChange({ services: Object.keys(next).length > 0 ? next : undefined })
  }
  return (
    <Stack gap="3">
      <HStack justify="space-between">
        <Text fontWeight="semibold">
          {site.icon} {site.name}{" "}
          <Text as="span" color="fg.muted" fontSize="xs">
            ({site.id})
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
            value={site.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Icon</Field.Label>
          <Input
            size="sm"
            maxLength={16}
            value={site.icon ?? ""}
            onChange={(e) => onChange({ icon: e.target.value })}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Mile</Field.Label>
          <Input
            size="sm"
            type="number"
            step="0.1"
            disabled={destination}
            value={site.mile}
            onChange={(e) => onChange({ mile: Number(e.target.value) })}
          />
        </Field.Root>
      </SimpleGrid>

      <Field.Root>
        <Field.Label fontSize="xs">Description</Field.Label>
        <Input
          size="sm"
          maxLength={160}
          value={site.description ?? ""}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </Field.Root>
      <Field.Root>
        <Field.Label fontSize="xs">Narrative</Field.Label>
        <Textarea
          size="sm"
          rows={5}
          maxLength={2000}
          value={site.narrative ?? ""}
          onChange={(e) =>
            onChange({ narrative: e.target.value.trim() ? e.target.value : undefined })
          }
        />
        <Field.HelperText fontSize="xs">
          Posted in chat when the van stops. The exit sign still says where you parked.
        </Field.HelperText>
      </Field.Root>
      <Field.Root maxW="240px">
        <Field.Label fontSize="xs">System message</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field
            value={site.narrativeVariant ?? ""}
            onChange={(e) => onChange({ narrativeVariant: narrativeVariant(e.target.value) })}
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
      </Field.Root>
      {art}
      <Field.Root>
        <Field.Label fontSize="xs">Lore (Markdown, shown once visited)</Field.Label>
        <Textarea
          size="sm"
          rows={3}
          maxLength={4000}
          value={site.lore ?? ""}
          onChange={(e) => onChange({ lore: e.target.value || undefined })}
        />
      </Field.Root>

      {!destination ? (
        <Box borderWidth="1px" borderRadius="md" p="3">
          <Text fontSize="sm" fontWeight="semibold" mb="2">
            Stop
          </Text>
          <HStack gap="4" flexWrap="wrap" mb="2">
            <Toggle
              label="Mandatory"
              checked={site.mandatory === true}
              onChange={(v) => onChange({ mandatory: v || undefined })}
            />
            <Toggle
              label="Secret until revealed"
              checked={site.secret !== false}
              onChange={(v) => onChange({ secret: v ? undefined : false })}
            />
            <Toggle
              label="Mystery poll"
              checked={site.skipPoll?.mystery === true}
              onChange={(v) => setSkipPoll({ mystery: v || undefined })}
            />
          </HStack>
          <SimpleGrid columns={{ base: 1, md: 3 }} gap="3">
            <Field.Root>
              <Field.Label fontSize="xs">Park minutes</Field.Label>
              <Input
                size="sm"
                type="number"
                placeholder={String(resolved?.tuning.parkMinutes ?? 4)}
                value={site.parkMinutes ?? ""}
                onChange={(e) => onChange({ parkMinutes: optionalNumber(e.target.value) })}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">Reveal miles ("always" or blank)</Field.Label>
              <Input
                size="sm"
                placeholder={String(resolved?.tuning.revealMiles ?? 10)}
                value={site.revealMiles ?? ""}
                onChange={(e) => {
                  const raw = e.target.value.trim()
                  onChange({ revealMiles: raw === "always" ? "always" : optionalNumber(raw) })
                }}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">Poll lead minutes</Field.Label>
              <Input
                size="sm"
                type="number"
                step="0.5"
                disabled={site.mandatory === true}
                placeholder={String(resolved?.tuning.skipPoll.leadMinutes ?? 1.5)}
                value={site.skipPoll?.leadMinutes ?? ""}
                onChange={(e) => setSkipPoll({ leadMinutes: optionalNumber(e.target.value) })}
              />
            </Field.Root>
          </SimpleGrid>
          {site.mandatory !== true ? (
            <SimpleGrid columns={{ base: 1, md: 2 }} gap="3" mt="3">
              <Field.Root>
                <Field.Label fontSize="xs">Poll question (blank = default)</Field.Label>
                <Input
                  size="sm"
                  maxLength={160}
                  value={site.skipPoll?.question ?? ""}
                  onChange={(e) => setSkipPoll({ question: e.target.value || undefined })}
                />
              </Field.Root>
              <Field.Root>
                <Field.Label fontSize="xs">No votes =</Field.Label>
                <NativeSelect.Root size="sm">
                  <NativeSelect.Field
                    value={site.skipPoll?.default ?? ""}
                    onChange={(e) =>
                      setSkipPoll({
                        default: (e.target.value || undefined) as "stop" | "skip" | undefined,
                      })
                    }
                  >
                    <option value="">
                      Map default (
                      {(resolved?.tuning.skipPoll.default ?? "skip") === "stop"
                        ? "Pull off"
                        : "Keep driving"}
                      )
                    </option>
                    <option value="stop">Pull off</option>
                    <option value="skip">Keep driving</option>
                  </NativeSelect.Field>
                  <NativeSelect.Indicator />
                </NativeSelect.Root>
              </Field.Root>
            </SimpleGrid>
          ) : null}
          {pollPreview ? (
            <Text fontSize="xs" color="fg.muted" mt="2">
              Poll preview: “{pollPreview}” · Pull off / Keep driving
            </Text>
          ) : null}
        </Box>
      ) : null}

      {!destination ? (
        <Box borderWidth="1px" borderRadius="md" p="3">
          <Text fontSize="sm" fontWeight="semibold" mb="2">
            Services
          </Text>
          <HStack gap="4" flexWrap="wrap" align="end">
            <Toggle
              label="Sells gas"
              checked={site.services?.gas !== undefined}
              onChange={(v) =>
                setServices({ gas: v ? { pricePerGallon: DEFAULT_GAS_PRICE } : undefined })
              }
            />
            <Toggle
              label="Mechanic (tow destination)"
              checked={site.services?.mechanic === true}
              onChange={(v) => setServices({ mechanic: v ? true : undefined })}
            />
            {site.services?.gas ? (
              <Field.Root maxW="160px">
                <Field.Label fontSize="xs">Coins per gallon</Field.Label>
                <Input
                  size="sm"
                  type="number"
                  step="0.5"
                  value={site.services.gas.pricePerGallon}
                  onChange={(e) => setServices({ gas: { pricePerGallon: Number(e.target.value) } })}
                />
              </Field.Root>
            ) : null}
          </HStack>
          {gasStop ? (
            <Text fontSize="xs" color="fg.muted" mt="2">
              If nobody votes, the van arrives at {Math.round(gasStop.arrivalPct * 100)}% and{" "}
              {gasStop.stops
                ? `fills ${gasStop.gallons.toFixed(1)} gal for ${gasStop.cost} coins.`
                : "drives past."}
            </Text>
          ) : null}
        </Box>
      ) : null}

      <Box borderWidth="1px" borderRadius="md" p="3">
        <Text fontSize="sm" fontWeight="semibold" mb="2">
          Shop
        </Text>
        <HStack gap="4" flexWrap="wrap" mb="2">
          {SHOP_OPTIONS.map((shop) => (
            <Toggle
              key={shop.shopId}
              label={shop.name}
              checked={shopIds.includes(shop.shopId)}
              onChange={(checked) =>
                setShop({
                  shopIds: checked
                    ? [...shopIds, shop.shopId]
                    : shopIds.filter((id) => id !== shop.shopId),
                })
              }
            />
          ))}
        </HStack>
        <Box mb="2">
          <TripOfferPicker
            offers={offers}
            sample={site.shop?.sample}
            onChange={(next) => setShop({ offers: next })}
            onSampleChange={(sample) => setShop({ sample })}
          />
        </Box>
        <Field.Root maxW="180px" mb="2">
          <Field.Label fontSize="xs">Buyback rate</Field.Label>
          <Input
            size="sm"
            type="number"
            min={0}
            max={1}
            step={0.05}
            placeholder="0"
            value={site.shop?.buybackRate ?? ""}
            onChange={(e) => {
              const raw = e.target.value.trim()
              if (raw === "") {
                setShop({ buybackRate: undefined })
                return
              }
              const n = Number(raw)
              setShop({
                buybackRate: Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined,
              })
            }}
          />
          <Field.HelperText fontSize="xs">
            {shopIds.length > 0
              ? "Catalog shops keep their own rates."
              : "Offers-only shops buy back at this fraction. 0 buys nothing back."}
          </Field.HelperText>
        </Field.Root>
        <SimpleGrid columns={{ base: 1, md: 2 }} gap="3">
          <Field.Root>
            <Field.Label fontSize="xs">Stand title</Field.Label>
            <Input
              size="sm"
              value={site.shop?.title ?? ""}
              onChange={(e) => setShop({ title: e.target.value || undefined })}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Opening message</Field.Label>
            <Input
              size="sm"
              maxLength={200}
              value={site.shop?.openingMessage ?? ""}
              onChange={(e) => setShop({ openingMessage: e.target.value || undefined })}
            />
          </Field.Root>
        </SimpleGrid>
      </Box>
    </Stack>
  )
}
