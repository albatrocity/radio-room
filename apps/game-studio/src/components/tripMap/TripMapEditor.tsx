import {
  Badge,
  Box,
  Button,
  Checkbox,
  Field,
  HStack,
  Heading,
  Input,
  NativeSelect,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { useEffect, useMemo, useRef, useState } from "react"
import {
  GENERIC_SITE_PRESETS,
  SAMPLE_BRANCH_MAP,
  SAMPLE_TRIP_MAP,
  describeTripFlow,
  eventTrigger,
  type TripMapInput,
} from "@repo/road-trip-map"
import { toaster } from "../ui/toaster"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import {
  DEFAULT_PREVIEW_WALLETS,
  EVENT_PRESET_BUTTONS,
  addBlankEvent,
  addBlankSite,
  addEventFromPreset,
  addSiteFromPreset,
  siteSlugFromName,
  draftRouteMiles,
  estimateEvent,
  hasFuelEvent,
  liftDraft,
  loadDraft,
  mapJson,
  moveEvent,
  moveSite,
  parseDraft,
  projectFuel,
  projectTrip,
  removeEvent,
  removeSite,
  resolvedMap,
  eventArrivalEstimates,
  siteArrivalEstimates,
  TRIP_ROOM_TYPES,
  type TripRoomType,
  saveDraft,
  updateFunds,
  updateRoute,
  updateEvent,
  updateSite,
  updateTuning,
  tripShareLabel,
  walletShareLabel,
} from "../../tripMap/tripMapDraft"
import { listSavedTripMaps, loadSavedTripMap, saveTripMapFile } from "../../tripMap/tripMapFiles"
import {
  addAltRoute,
  addKeyItem,
  addLayer,
  addTripMap,
  removeKeyItem,
  removeTripMap,
  updateKeyItem,
  updateTripMap,
  moveRouteEnd,
  moveRouteFork,
  removeAltRoute,
  removeLayer,
  scaleTripDrive,
  updateAltRoute,
  updateLayer,
} from "../../tripMap/branchesDraft"
import {
  fetchSiteAssetStatus,
  pendingAssetIssues,
  pendingAssetKey,
  type SiteAssetStatus,
} from "../../tripMap/siteAssets"
import { useSiteAssetUpload } from "./useSiteAssetUpload"
import { TripFuelCurve } from "./TripFuelCurve"
import { TripFlowPanel } from "./TripFlowPanel"
import { TripLayerInspector } from "./TripLayerInspector"
import { TripKeyItemInspector } from "./TripKeyItemInspector"
import { TripMapItemInspector } from "./TripMapItemInspector"
import { TripRouteInspector } from "./TripRouteInspector"
import { TripRouteTrack, TripTimelineFrame, type TrackSelection } from "./TripRouteTrack"
import { TripSiteArt } from "./TripSiteArt"
import { TripEventInspector } from "./TripEventInspector"
import { TripSiteInspector } from "./TripSiteInspector"
import { TripVanPlayback } from "./TripVanPlayback"

function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

function minutesLabel(minutes: number): string {
  return `${Math.round(minutes)} min`
}

function numberOr(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Trip Map editor v1 (M8): route, site pins, inspector, site art published to the
 * CDN, shop and offers picker, projections, fuel curve and gas bill, trip
 * events (ADR 0228) with cost estimates, trip settings, lint, and Copy JSON /
 * save `maps/<id>.json`. Runs no plugin code;
 * only pure `@repo/road-trip-map` modules.
 */
const LINT_DEBOUNCE_MS = 250

/** A site with no preset. Name and slug are typed here; the inspector fills in the rest. */
function BlankSiteButton({ onAdd }: { onAdd: (name: string, slug: string) => string | null }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [slugTouched, setSlugTouched] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName("")
    setSlug("")
    setSlugTouched(false)
    setError(null)
  }

  const submit = () => {
    const message = onAdd(name, slug)
    if (message) {
      setError(message)
      return
    }
    setOpen(false)
    reset()
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(details) => {
        setOpen(details.open)
        if (details.open) reset()
      }}
      positioning={{ placement: "bottom-start" }}
    >
      <Popover.Trigger asChild>
        <Button size="xs" variant="outline">
          📍 Blank site
        </Button>
      </Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content p="3" minW="240px">
          <Stack gap="2">
            <Field.Root>
              <Field.Label fontSize="xs">Name</Field.Label>
              <Input
                size="sm"
                maxLength={60}
                autoFocus
                value={name}
                placeholder="Roadside diner"
                onChange={(event) => {
                  const next = event.target.value
                  setName(next)
                  if (!slugTouched) setSlug(siteSlugFromName(next))
                  setError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit()
                }}
              />
            </Field.Root>
            <Field.Root invalid={error != null}>
              <Field.Label fontSize="xs">Slug</Field.Label>
              <Input
                size="sm"
                maxLength={64}
                value={slug}
                placeholder="roadside-diner"
                onChange={(event) => {
                  setSlugTouched(true)
                  setSlug(event.target.value)
                  setError(null)
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") submit()
                }}
              />
              {error ? <Field.ErrorText fontSize="xs">{error}</Field.ErrorText> : null}
            </Field.Root>
            <Button size="sm" onClick={submit}>
              Add site
            </Button>
          </Stack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}

type MapSelection = TrackSelection

export function TripMapEditor() {
  const [draft, setDraft] = useState<TripMapInput>(loadDraft)
  const [selection, setSelection] = useState<MapSelection>(null)
  const [departAt, setDepartAt] = useState(() => Date.now())
  const [roomType, setRoomType] = useState<TripRoomType>("radio")
  const [importText, setImportText] = useState("")
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [costScale, setCostScale] = useState(1)
  const [scaleLocations, setScaleLocations] = useState(false)
  // The map when this drive-minutes edit began. Each keystroke scales from here,
  // so typing 120 doesn't round the pins at 1 and again at 12.
  const scaleFrom = useRef<TripMapInput | null>(null)
  const [walletsTotal, setWalletsTotal] = useState(DEFAULT_PREVIEW_WALLETS)
  const [assetStatus, setAssetStatus] = useState<SiteAssetStatus | null>(null)
  const { pendingAssets, uploadAsset, discardPending } = useSiteAssetUpload(setDraft)

  // Full parse (schema + lint + hash) and the localStorage write wait for typing to pause.
  const settledDraft = useDebouncedValue(draft, LINT_DEBOUNCE_MS)
  useEffect(() => saveDraft(settledDraft), [settledDraft])
  useEffect(() => {
    void listSavedTripMaps().then(setSavedIds)
    void fetchSiteAssetStatus().then(setAssetStatus)
  }, [])

  const miles = draftRouteMiles(draft)
  const resolved = useMemo(() => resolvedMap(draft), [draft])
  const parsed = useMemo(
    () => parseDraft(settledDraft, departAt, roomType),
    [settledDraft, departAt, roomType],
  )
  const projection = resolved ? projectTrip(resolved, departAt) : null
  const arrivals = useMemo(
    () => (resolved ? siteArrivalEstimates(resolved, departAt) : null),
    [resolved, departAt],
  )
  const eventArrivals = useMemo(
    () => (resolved ? eventArrivalEstimates(resolved, departAt) : null),
    [resolved, departAt],
  )
  const fuel = useMemo(
    () => (resolved ? projectFuel(resolved, costScale) : null),
    [resolved, costScale],
  )
  const outline = useMemo(() => (resolved ? describeTripFlow(resolved) : null), [resolved])
  const selectedSiteId = selection?.kind === "site" ? selection.id : null
  const selectedEventId = selection?.kind === "event" ? selection.id : null
  const selected = draft.sites.find((s) => s.id === selectedSiteId)
  const selectedEvent = draft.events?.find((e) => e.id === selectedEventId)
  const fuelEvents = (draft.events ?? []).filter((e) => eventTrigger(e) === "fuel")
  const selectedRoute =
    selection?.kind === "route" ? draft.routes?.find((r) => r.id === selection.id) : undefined
  const selectedLayer =
    selection?.kind === "layer" ? draft.layers?.find((l) => l.id === selection.id) : undefined
  const selectedMap =
    selection?.kind === "map" ? draft.maps?.find((m) => m.id === selection.id) : undefined
  const selectedKey =
    selection?.kind === "key" ? draft.keyItems?.find((key) => key.id === selection.id) : undefined
  const selectSite = (siteId: string | null) => {
    setSelection(siteId ? { kind: "site", id: siteId } : null)
  }
  const selectEvent = (eventId: string | null) => {
    setSelection(eventId ? { kind: "event", id: eventId } : null)
  }
  const assetIssues = pendingAssetIssues(draft, pendingAssets)
  const issues = [...assetIssues, ...parsed.issues]
  const errors = issues.filter((i) => i.severity === "error")
  const warnings = issues.filter((i) => i.severity === "warning")
  const exportBlocked = assetIssues.length > 0

  const copyJson = async () => {
    await navigator.clipboard.writeText(mapJson(draft))
    toaster.create({
      title: "Copied map JSON",
      description:
        errors.length > 0 ? "The map still has lint errors; the plugin will reject it." : undefined,
      type: errors.length > 0 ? "warning" : "success",
    })
  }

  const saveFile = async () => {
    const result = await saveTripMapFile(draft.id, mapJson(draft))
    toaster.create({
      title: result.ok ? `Saved maps/${draft.id}.json` : "Save failed",
      description: result.ok ? undefined : result.message,
      type: result.ok ? "success" : "error",
    })
    if (result.ok) setSavedIds(await listSavedTripMaps())
  }

  const importJson = (text: string) => {
    try {
      setDraft(liftDraft(JSON.parse(text)))
      setSelection(null)
      setImportText("")
    } catch (error) {
      toaster.create({ title: "Not valid JSON", description: String(error), type: "error" })
    }
  }

  return (
    <Stack gap="4">
      <HStack justify="space-between" flexWrap="wrap" gap="2">
        <Heading size="md">Trip map editor</Heading>
        <HStack gap="2" flexWrap="wrap">
          <Badge
            colorPalette={errors.length > 0 ? "red" : warnings.length > 0 ? "yellow" : "green"}
          >
            {errors.length} errors · {warnings.length} warnings
          </Badge>
          <Button
            size="xs"
            variant="outline"
            disabled={exportBlocked}
            title={exportBlocked ? "Finish or discard site art uploads first" : undefined}
            onClick={() => void copyJson()}
          >
            Copy JSON
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={exportBlocked}
            title={exportBlocked ? "Finish or discard site art uploads first" : undefined}
            onClick={() => void saveFile()}
          >
            Save maps/{draft.id}.json
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Replace the draft with the sample map?")) {
                setDraft(structuredClone(SAMPLE_TRIP_MAP))
                setSelection(null)
              }
            }}
          >
            Reset to sample
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              if (
                window.confirm(
                  "Replace the draft with the branching sample (routes, a layer, a choice)?",
                )
              ) {
                setDraft(structuredClone(SAMPLE_BRANCH_MAP))
                setSelection(null)
              }
            }}
          >
            Branching sample
          </Button>
        </HStack>
      </HStack>

      <Box borderWidth="1px" borderRadius="md" p="3">
        <Text fontSize="sm" fontWeight="semibold" mb="2">
          Trip
        </Text>
        <SimpleGrid columns={{ base: 2, md: 6 }} gap="3">
          <Field.Root>
            <Field.Label fontSize="xs">Map id</Field.Label>
            <Input
              size="sm"
              value={draft.id}
              onChange={(e) => setDraft({ ...draft, id: e.target.value })}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Title</Field.Label>
            <Input
              size="sm"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Drive minutes</Field.Label>
            <Input
              size="sm"
              type="number"
              value={draft.route.driveMinutes}
              title={
                scaleLocations
                  ? "Sites, events, and side roads keep their place along the drive. Stop lengths stay the same."
                  : undefined
              }
              onFocus={() => {
                if (scaleLocations) scaleFrom.current = structuredClone(draft)
              }}
              onChange={(e) => {
                const next = Number(e.target.value)
                if (!scaleLocations) {
                  setDraft(updateRoute(draft, { driveMinutes: next }))
                  return
                }
                if (!Number.isFinite(next) || next <= 0) return
                const result = scaleTripDrive(scaleFrom.current ?? draft, next)
                if (!result.ok) {
                  toaster.create({
                    title: "Can't scale locations",
                    description: result.error,
                    type: "error",
                  })
                  return
                }
                setDraft(result.draft)
              }}
            />
            <Field.Root>
              <Checkbox.Root
                size="sm"
                checked={scaleLocations}
                onCheckedChange={(details) => {
                  const on = details.checked === true
                  setScaleLocations(on)
                  scaleFrom.current = on ? structuredClone(draft) : null
                }}
              >
                <Checkbox.HiddenInput />
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Label fontSize="xs">Scale locations</Checkbox.Label>
              </Checkbox.Root>
            </Field.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Deadline (optional)</Field.Label>
            <Input
              size="sm"
              type="datetime-local"
              value={draft.route.deadlineAt ? toLocalInput(Date.parse(draft.route.deadlineAt)) : ""}
              onChange={(e) =>
                setDraft(
                  updateRoute(draft, {
                    deadlineAt: e.target.value ? new Date(e.target.value).toISOString() : undefined,
                  }),
                )
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Planned departure</Field.Label>
            <Input
              size="sm"
              type="datetime-local"
              value={toLocalInput(departAt)}
              onChange={(e) => e.target.value && setDepartAt(new Date(e.target.value).getTime())}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Room type</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={roomType}
                onChange={(e) => setRoomType(e.target.value as TripRoomType)}
              >
                {TRIP_ROOM_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type[0]!.toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Funds</Field.Label>
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={draft.tuning?.funds?.mode ?? "automatic"}
                onChange={(e) =>
                  setDraft(
                    updateFunds(draft, { mode: e.target.value as "automatic" | "voluntary" }),
                  )
                }
              >
                <option value="automatic">Automatic (split by wealth)</option>
                <option value="voluntary">Voluntary (chip-in pool)</option>
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Pool window minutes</Field.Label>
            <Input
              size="sm"
              type="number"
              placeholder="3"
              disabled={(draft.tuning?.funds?.mode ?? "automatic") !== "voluntary"}
              value={draft.tuning?.funds?.windowMinutes ?? ""}
              onChange={(e) =>
                setDraft(updateFunds(draft, { windowMinutes: numberOr(e.target.value) }))
              }
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Preview cost scale</Field.Label>
            <Input
              size="sm"
              type="number"
              step="0.1"
              min="0"
              value={costScale}
              onChange={(e) => setCostScale(Math.max(0, numberOr(e.target.value) ?? 1))}
            />
          </Field.Root>
          <Field.Root>
            <Field.Label fontSize="xs">Room wallets (estimate)</Field.Label>
            <Input
              size="sm"
              type="number"
              step="100"
              min="0"
              value={walletsTotal}
              onChange={(e) =>
                setWalletsTotal(Math.max(0, numberOr(e.target.value) ?? DEFAULT_PREVIEW_WALLETS))
              }
            />
            <Field.HelperText fontSize="xs">
              Total coins across travelers when costs hit. Default: 12 × 500.
            </Field.HelperText>
          </Field.Root>
        </SimpleGrid>
      </Box>

      <Box borderWidth="1px" borderRadius="md" p="3">
        <Text fontSize="sm" fontWeight="semibold" mb="2">
          Van
        </Text>
        <Stack gap="3">
          <SimpleGrid columns={{ base: 2, md: 6 }} gap="3">
            <Field.Root>
              <Field.Label fontSize="xs">Base mph</Field.Label>
              <Input
                size="sm"
                type="number"
                value={draft.route.baseMph ?? 55}
                onChange={(e) => setDraft(updateRoute(draft, { baseMph: Number(e.target.value) }))}
              />
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">Tanks per trip</Field.Label>
              <Input
                size="sm"
                type="number"
                step="0.1"
                placeholder="1.6"
                value={draft.route.tanksPerTrip ?? ""}
                onChange={(e) =>
                  setDraft(updateRoute(draft, { tanksPerTrip: numberOr(e.target.value) }))
                }
              />
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">Tank gallons</Field.Label>
              <Input
                size="sm"
                type="number"
                placeholder="15"
                value={draft.tuning?.tankGallons ?? ""}
                onChange={(e) =>
                  setDraft(updateTuning(draft, { tankGallons: numberOr(e.target.value) }))
                }
              />
            </Field.Root>
            <Field.Root>
              <Field.Label fontSize="xs">Low fuel %</Field.Label>
              <Input
                size="sm"
                type="number"
                placeholder="15"
                value={
                  draft.tuning?.lowFuelPct !== undefined
                    ? Math.round(draft.tuning.lowFuelPct * 100)
                    : ""
                }
                onChange={(e) => {
                  const pct = numberOr(e.target.value)
                  setDraft(
                    updateTuning(draft, { lowFuelPct: pct === undefined ? undefined : pct / 100 }),
                  )
                }}
              />
            </Field.Root>
          </SimpleGrid>
          <TripVanPlayback draft={draft} onChange={setDraft} />
        </Stack>
      </Box>

      <Stack gap="2">
        <HStack gap="2" flexWrap="wrap">
          <Text fontSize="xs" color="fg.muted" minW="72px">
            Add site:
          </Text>
          <BlankSiteButton
            onAdd={(name, slug) => {
              const result = addBlankSite(draft, { name, slug })
              if (!result.ok) return result.error
              setDraft(result.draft)
              selectSite(result.siteId)
              return null
            }}
          />
          {GENERIC_SITE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              size="xs"
              variant="subtle"
              onClick={() => {
                const next = addSiteFromPreset(draft, preset)
                setDraft(next.draft)
                selectSite(next.siteId)
              }}
            >
              {preset.site.icon} {preset.label}
            </Button>
          ))}
        </HStack>

        <HStack gap="2" flexWrap="wrap">
          <Text fontSize="xs" color="fg.muted" minW="72px">
            Add branch:
          </Text>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              const next = addAltRoute(draft)
              setDraft(next.draft)
              setSelection({ kind: "route", id: next.routeId })
            }}
          >
            🛣️ Route
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              const next = addLayer(draft)
              setDraft(next.draft)
              setSelection({ kind: "layer", id: next.layerId })
            }}
          >
            🗺️ Layer
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              const next = addTripMap(draft)
              setDraft(next.draft)
              setSelection({ kind: "map", id: next.mapId })
            }}
          >
            🧭 Map
          </Button>
          <Button
            size="xs"
            variant="outline"
            disabled={(draft.keyItems?.length ?? 0) >= 16}
            onClick={() => {
              const next = addKeyItem(draft)
              setDraft(next.draft)
              setSelection({ kind: "key", id: next.keyId })
            }}
          >
            🔑 Key
          </Button>
        </HStack>

        <HStack gap="2" flexWrap="wrap">
          <Text fontSize="xs" color="fg.muted" minW="72px">
            Add event:
          </Text>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              const next = addBlankEvent(draft)
              setDraft(next.draft)
              selectEvent(next.eventId)
            }}
          >
            + Blank
          </Button>
          {EVENT_PRESET_BUTTONS.map((preset) => (
            <Button
              key={preset.id}
              size="xs"
              variant="subtle"
              disabled={preset.fuel && hasFuelEvent(draft)}
              title={preset.fuel ? "Replaces Out of Gas; a map has one" : undefined}
              onClick={() => {
                const next = addEventFromPreset(draft, preset.id)
                setDraft(next.draft)
                selectEvent(next.eventId)
              }}
            >
              {preset.icon} {preset.name}
            </Button>
          ))}
          {fuelEvents.map((event) => (
            <Button
              key={event.id}
              size="xs"
              variant={event.id === selectedEventId ? "solid" : "ghost"}
              title="Fires when the tank runs dry, so it isn't on the track"
              onClick={() => selectEvent(event.id)}
            >
              ⛽ Edit {event.icon} {event.name}
            </Button>
          ))}
        </HStack>
      </Stack>

      <Box borderWidth="1px" borderRadius="md" p="3">
        <TripTimelineFrame>
          <TripRouteTrack
            draft={draft}
            resolved={resolved}
            selection={selection}
            onSelect={setSelection}
            onMoveSite={(siteId, mile) => setDraft((d) => moveSite(d, siteId, mile))}
            onMoveEvent={(eventId, mile) => setDraft((d) => moveEvent(d, eventId, mile))}
            onMoveFork={(routeId, mile) => setDraft((d) => moveRouteFork(d, routeId, mile))}
            onMoveEnd={(routeId, mile) => setDraft((d) => moveRouteEnd(d, routeId, mile))}
          />
          {fuel ? <TripFuelCurve fuel={fuel} routeMiles={miles} /> : null}
        </TripTimelineFrame>
      </Box>

      <SimpleGrid columns={{ base: 1, lg: 3 }} gap="4" alignItems="start">
        <Box gridColumn={{ lg: "span 2" }} borderWidth="1px" borderRadius="md" p="3">
          {selected ? (
            <TripSiteInspector
              site={selected}
              draft={draft}
              resolved={resolved}
              gasStop={fuel?.stops.find((s) => s.siteId === selected.id)}
              arrivalAt={arrivals?.get(selected.id)}
              art={
                <TripSiteArt
                  site={selected}
                  assetStatus={assetStatus}
                  pendingImage={pendingAssets[pendingAssetKey(selected.id, "image")]}
                  pendingModel={pendingAssets[pendingAssetKey(selected.id, "model")]}
                  onChange={(patch) => setDraft((d) => updateSite(d, selected.id, patch))}
                  onUpload={(kind, file) => void uploadAsset(selected.id, kind, file)}
                  onDiscardPending={(kind) => discardPending(selected.id, kind)}
                />
              }
              onChange={(patch) => setDraft((d) => updateSite(d, selected.id, patch))}
              onRemove={() => {
                setDraft((d) => removeSite(d, selected.id))
                setSelection(null)
              }}
            />
          ) : selectedEvent ? (
            <TripEventInspector
              event={selectedEvent}
              draft={draft}
              estimate={resolved ? estimateEvent(resolved, selectedEvent.id, costScale) : null}
              arrivalAt={eventArrivals?.get(selectedEvent.id)}
              walletShare={(cost) => walletShareLabel(cost, walletsTotal)}
              onChange={(patch) => setDraft((d) => updateEvent(d, selectedEvent.id, patch))}
              onRemove={() => {
                setDraft((d) => removeEvent(d, selectedEvent.id))
                setSelection(null)
              }}
            />
          ) : selectedRoute ? (
            <TripRouteInspector
              draft={draft}
              route={selectedRoute}
              onChange={(patch) => setDraft((d) => updateAltRoute(d, selectedRoute.id, patch))}
              onRemove={() => {
                setDraft((d) => removeAltRoute(d, selectedRoute.id))
                setSelection(null)
              }}
            />
          ) : selectedLayer ? (
            <TripLayerInspector
              layer={selectedLayer}
              maps={draft.maps ?? []}
              outline={outline?.layers.find((l) => l.id === selectedLayer.id) ?? null}
              onChange={(patch) => setDraft((d) => updateLayer(d, selectedLayer.id, patch))}
              onRemove={() => {
                setDraft((d) => removeLayer(d, selectedLayer.id))
                setSelection(null)
              }}
            />
          ) : selectedMap ? (
            <TripMapItemInspector
              item={selectedMap}
              draft={draft}
              onChange={(patch) => setDraft((d) => updateTripMap(d, selectedMap.id, patch))}
              onRemove={() => {
                setDraft((d) => removeTripMap(d, selectedMap.id))
                setSelection(null)
              }}
            />
          ) : selectedKey ? (
            <TripKeyItemInspector
              item={selectedKey}
              outline={outline?.keyItems.find((key) => key.id === selectedKey.id) ?? null}
              onChange={(patch) => setDraft((d) => updateKeyItem(d, selectedKey.id, patch))}
              onRemove={() => {
                setDraft((d) => removeKeyItem(d, selectedKey.id))
                setSelection(null)
              }}
            />
          ) : (
            <Text fontSize="sm" color="fg.muted">
              Select a pin, route, or layer to edit it. Drag pins to set their mile; the destination
              stays at the end.
            </Text>
          )}
        </Box>

        <Stack gap="4">
          <Box borderWidth="1px" borderRadius="md" p="3">
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Flow
            </Text>
            <TripFlowPanel
              outline={outline}
              onSelectRoute={(id) => setSelection({ kind: "route", id })}
              onSelectLayer={(id) => setSelection({ kind: "layer", id })}
              onSelectMap={(id) => setSelection({ kind: "map", id })}
              onSelectKey={(id) => setSelection({ kind: "key", id })}
            />
          </Box>

          <Box borderWidth="1px" borderRadius="md" p="3">
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Projections (main road)
            </Text>
            {projection ? (
              <Stack gap="1" fontSize="sm">
                <Text>
                  {projection.routeMiles.toFixed(1)} mi · {minutesLabel(projection.driveMinutes)}{" "}
                  driving
                </Text>
                <Text>Skip every optional stop: {minutesLabel(projection.fastestMinutes)}</Text>
                <Text>Poll defaults: {minutesLabel(projection.defaultMinutes)}</Text>
                <Text>Stop everywhere: {minutesLabel(projection.slowestMinutes)}</Text>
                {projection.deadlineMinutes !== null ? (
                  <Text
                    color={
                      projection.defaultMinutes > projection.deadlineMinutes ? "red.fg" : "green.fg"
                    }
                  >
                    Deadline in {minutesLabel(projection.deadlineMinutes)} from departure
                  </Text>
                ) : null}
              </Stack>
            ) : (
              <Text fontSize="sm" color="fg.muted">
                Fix schema errors to see projections.
              </Text>
            )}
          </Box>

          {fuel ? (
            <Box borderWidth="1px" borderRadius="md" p="3">
              <Text fontSize="sm" fontWeight="semibold" mb="2">
                Gas if nobody votes
              </Text>
              {fuel.stops.length === 0 ? (
                <Text fontSize="sm" color="fg.muted">
                  No gas sites on the route.
                </Text>
              ) : (
                <Stack gap="1">
                  {fuel.stops.map((stop) => (
                    <Text
                      key={stop.siteId}
                      fontSize="xs"
                      cursor="pointer"
                      color={stop.stops ? undefined : "fg.muted"}
                      onClick={() => selectSite(stop.siteId)}
                    >
                      {stop.icon} {stop.name} · mile {stop.mile.toFixed(1)} · arrives{" "}
                      {Math.round(stop.arrivalPct * 100)}% ·{" "}
                      {stop.stops
                        ? `fills ${stop.gallons.toFixed(1)} gal for ${stop.cost} coins (${walletShareLabel(stop.cost, walletsTotal)})`
                        : "drives past"}
                    </Text>
                  ))}
                  <Text fontSize="xs" fontWeight="medium" mt="1">
                    Total: {fuel.totalCost} coins at cost scale {costScale} (
                    {tripShareLabel(fuel.totalCost, walletsTotal)})
                  </Text>
                </Stack>
              )}
            </Box>
          ) : null}

          <Box borderWidth="1px" borderRadius="md" p="3">
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Lint
            </Text>
            {issues.length === 0 ? (
              <Text fontSize="sm" color="green.fg">
                No issues. Ready to load.
              </Text>
            ) : (
              <Stack gap="1">
                {issues.map((issue, i) => (
                  <Text
                    key={`${issue.code}-${i}`}
                    fontSize="xs"
                    color={issue.severity === "error" ? "red.fg" : "yellow.fg"}
                    cursor={issue.siteId ? "pointer" : undefined}
                    onClick={() => issue.siteId && selectSite(issue.siteId)}
                  >
                    {issue.severity === "error" ? "✖" : "⚠"} {issue.message}
                  </Text>
                ))}
              </Stack>
            )}
          </Box>

          <Box borderWidth="1px" borderRadius="md" p="3">
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Files
            </Text>
            {savedIds.length > 0 ? (
              <NativeSelect.Root size="sm" mb="2">
                <NativeSelect.Field
                  value=""
                  onChange={(e) => {
                    const id = e.target.value
                    if (!id) return
                    void loadSavedTripMap(id).then((text) => text && importJson(text))
                  }}
                >
                  <option value="">Open maps/…</option>
                  {savedIds.map((id) => (
                    <option key={id} value={id}>
                      {id}.json
                    </option>
                  ))}
                </NativeSelect.Field>
                <NativeSelect.Indicator />
              </NativeSelect.Root>
            ) : null}
            <Textarea
              size="xs"
              rows={3}
              placeholder="Paste map JSON to import…"
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
            />
            <Button
              size="xs"
              mt="2"
              variant="outline"
              disabled={!importText.trim()}
              onClick={() => importJson(importText)}
            >
              Import
            </Button>
          </Box>
        </Stack>
      </SimpleGrid>
    </Stack>
  )
}
