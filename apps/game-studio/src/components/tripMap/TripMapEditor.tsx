import {
  Badge,
  Box,
  Button,
  Field,
  HStack,
  Heading,
  Input,
  NativeSelect,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
} from "@chakra-ui/react"
import { useEffect, useMemo, useState } from "react"
import {
  FUND_PURPOSE_LABELS,
  INCIDENTS,
  SAMPLE_TRIP_MAP,
  TRIGGERABLE_INCIDENT_IDS,
  type TripMapInput,
} from "@repo/road-trip-map"
import { toaster } from "../ui/toaster"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import {
  DEFAULT_PREVIEW_WALLETS,
  SITE_LIBRARY,
  addScriptedEvent,
  addSiteFromPreset,
  draftRouteMiles,
  estimateIncidents,
  loadDraft,
  mapJson,
  moveSite,
  parseDraft,
  projectFuel,
  projectTrip,
  removeScriptedEvent,
  removeSite,
  resolvedMap,
  saveDraft,
  updateFunds,
  updateRoute,
  updateScriptedEvent,
  updateSite,
  updateTuning,
  tripShareLabel,
  walletShareLabel,
  type ScriptedEventDraft,
} from "../../tripMap/tripMapDraft"
import { listSavedTripMaps, loadSavedTripMap, saveTripMapFile } from "../../tripMap/tripMapFiles"
import { TripFuelCurve } from "./TripFuelCurve"
import { TripRouteTrack } from "./TripRouteTrack"
import { TripSiteInspector } from "./TripSiteInspector"

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
 * Trip Map editor v1 (M8, Phases 1–3): route, site pins, inspector, shop and offers
 * picker, projections, fuel curve and gas bill, scripted incidents with cost
 * estimates, trip settings, lint, and Copy JSON /
 * save `maps/<id>.json`. Runs no plugin code;
 * only pure `@repo/road-trip-map` modules.
 */
const LINT_DEBOUNCE_MS = 250

export function TripMapEditor() {
  const [draft, setDraft] = useState<TripMapInput>(loadDraft)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [departAt, setDepartAt] = useState(() => Date.now())
  const [importText, setImportText] = useState("")
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [costScale, setCostScale] = useState(1)
  const [walletsTotal, setWalletsTotal] = useState(DEFAULT_PREVIEW_WALLETS)

  // Full parse (schema + lint + hash) and the localStorage write wait for typing to pause.
  const settledDraft = useDebouncedValue(draft, LINT_DEBOUNCE_MS)
  useEffect(() => saveDraft(settledDraft), [settledDraft])
  useEffect(() => {
    void listSavedTripMaps().then(setSavedIds)
  }, [])

  const miles = draftRouteMiles(draft)
  const resolved = useMemo(() => resolvedMap(draft), [draft])
  const parsed = useMemo(() => parseDraft(settledDraft, departAt), [settledDraft, departAt])
  const projection = resolved ? projectTrip(resolved, departAt) : null
  const fuel = useMemo(() => (resolved ? projectFuel(resolved, costScale) : null), [resolved, costScale])
  const selected = draft.sites.find((s) => s.id === selectedSiteId)
  const errors = parsed.issues.filter((i) => i.severity === "error")
  const warnings = parsed.issues.filter((i) => i.severity === "warning")

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
      setDraft(JSON.parse(text) as TripMapInput)
      setSelectedSiteId(null)
      setSelectedEventId(null)
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
          <Button size="xs" variant="outline" onClick={() => void copyJson()}>
            Copy JSON
          </Button>
          <Button size="xs" variant="outline" onClick={() => void saveFile()}>
            Save maps/{draft.id}.json
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => {
              if (window.confirm("Replace the draft with the sample map?")) {
                setDraft(structuredClone(SAMPLE_TRIP_MAP))
                setSelectedSiteId(null)
                setSelectedEventId(null)
              }
            }}
          >
            Reset to sample
          </Button>
        </HStack>
      </HStack>

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
            onChange={(e) => setDraft(updateRoute(draft, { driveMinutes: Number(e.target.value) }))}
          />
        </Field.Root>
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
      </SimpleGrid>

      <SimpleGrid columns={{ base: 2, md: 6 }} gap="3">
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
              draft.tuning?.lowFuelPct !== undefined ? Math.round(draft.tuning.lowFuelPct * 100) : ""
            }
            onChange={(e) => {
              const pct = numberOr(e.target.value)
              setDraft(updateTuning(draft, { lowFuelPct: pct === undefined ? undefined : pct / 100 }))
            }}
          />
        </Field.Root>
        <Field.Root>
          <Field.Label fontSize="xs">Funds</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field
              value={draft.tuning?.funds?.mode ?? "automatic"}
              onChange={(e) =>
                setDraft(updateFunds(draft, { mode: e.target.value as "automatic" | "voluntary" }))
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

      <HStack gap="2" flexWrap="wrap">
        <Text fontSize="xs" color="fg.muted">
          Add site:
        </Text>
        {SITE_LIBRARY.map((preset) => (
          <Button
            key={preset.id}
            size="xs"
            variant="subtle"
            onClick={() => {
              const next = addSiteFromPreset(draft, preset)
              setDraft(next.draft)
              setSelectedSiteId(next.siteId)
            }}
          >
            {preset.site.icon} {preset.label}
          </Button>
        ))}
      </HStack>

      <Box borderWidth="1px" borderRadius="md" p="3">
        <TripRouteTrack
          sites={draft.sites}
          events={draft.scriptedEvents ?? []}
          routeMiles={miles}
          resolved={resolved}
          selectedSiteId={selectedSiteId}
          selectedEventId={selectedEventId}
          onSelect={setSelectedSiteId}
          onMove={(siteId, mile) => setDraft((d) => moveSite(d, siteId, mile))}
          onSelectEvent={setSelectedEventId}
          onMoveEvent={(eventId, atMile) =>
            setDraft((d) => updateScriptedEvent(d, eventId, { atMile }))
          }
        />
        {fuel ? <TripFuelCurve fuel={fuel} routeMiles={miles} /> : null}
      </Box>

      <SimpleGrid columns={{ base: 1, lg: 3 }} gap="4" alignItems="start">
        <Box gridColumn={{ lg: "span 2" }} borderWidth="1px" borderRadius="md" p="3">
          {selected ? (
            <TripSiteInspector
              site={selected}
              resolved={resolved}
              gasStop={fuel?.stops.find((s) => s.siteId === selected.id)}
              onChange={(patch) => setDraft((d) => updateSite(d, selected.id, patch))}
              onRemove={() => {
                setDraft((d) => removeSite(d, selected.id))
                setSelectedSiteId(null)
              }}
            />
          ) : (
            <Text fontSize="sm" color="fg.muted">
              Select a pin to edit the site. Drag pins to set their mile; the destination stays at
              the end.
            </Text>
          )}
        </Box>

        <Stack gap="4">
          <Box borderWidth="1px" borderRadius="md" p="3">
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Projections
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
                      onClick={() => setSelectedSiteId(stop.siteId)}
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
              Scripted incidents
            </Text>
            <Stack gap="2">
              {(draft.scriptedEvents ?? []).map((event) => {
                const estimate = resolved
                  ? estimateIncidents(resolved, event.atMile, costScale).find(
                      (e) => e.incident === event.incident,
                    )
                  : undefined
                return (
                  <Stack
                    key={event.id}
                    gap="1"
                    p="2"
                    borderRadius="md"
                    borderWidth={event.id === selectedEventId ? "2px" : "1px"}
                    borderColor={event.id === selectedEventId ? "blue.solid" : undefined}
                    onClick={() => setSelectedEventId(event.id)}
                  >
                    <HStack gap="2">
                      <NativeSelect.Root size="xs" flex="1">
                        <NativeSelect.Field
                          value={event.incident}
                          onChange={(e) =>
                            setDraft((d) =>
                              updateScriptedEvent(d, event.id, {
                                incident: e.target.value as ScriptedEventDraft["incident"],
                              }),
                            )
                          }
                        >
                          {TRIGGERABLE_INCIDENT_IDS.map((id) => (
                            <option key={id} value={id}>
                              {INCIDENTS[id].emoji} {INCIDENTS[id].name}
                            </option>
                          ))}
                        </NativeSelect.Field>
                        <NativeSelect.Indicator />
                      </NativeSelect.Root>
                      <Input
                        size="xs"
                        type="number"
                        step="0.1"
                        maxW="80px"
                        aria-label="Mile"
                        value={event.atMile}
                        onChange={(e) =>
                          setDraft((d) =>
                            updateScriptedEvent(d, event.id, { atMile: Number(e.target.value) }),
                          )
                        }
                      />
                      <Button
                        size="xs"
                        variant="ghost"
                        colorPalette="red"
                        onClick={() => setDraft((d) => removeScriptedEvent(d, event.id))}
                      >
                        Remove
                      </Button>
                    </HStack>
                    {estimate ? (
                      <Text fontSize="xs" color="fg.muted">
                        {estimate.lines.length > 0
                          ? `${estimate.lines.map((l) => `${FUND_PURPOSE_LABELS[l.purpose]} ${l.cost}${l.waivable ? " (AAA covers)" : ""}`).join(" + ")} = ${estimate.total} coins (${walletShareLabel(estimate.total, walletsTotal)})`
                          : "No cost (items or a wait only)"}
                      </Text>
                    ) : null}
                  </Stack>
                )
              })}
              <HStack gap="1" flexWrap="wrap">
                {TRIGGERABLE_INCIDENT_IDS.map((id) => (
                  <Button
                    key={id}
                    size="xs"
                    variant="subtle"
                    onClick={() => setDraft((d) => addScriptedEvent(d, id))}
                  >
                    + {INCIDENTS[id].emoji} {INCIDENTS[id].name}
                  </Button>
                ))}
              </HStack>
              <Text fontSize="xs" color="fg.muted">
                Hosts can also trigger these live from Quick Access. Out of Gas only follows an
                empty tank.
              </Text>
            </Stack>
          </Box>

          <Box borderWidth="1px" borderRadius="md" p="3">
            <Text fontSize="sm" fontWeight="semibold" mb="2">
              Lint
            </Text>
            {parsed.issues.length === 0 ? (
              <Text fontSize="sm" color="green.fg">
                No issues. Ready to load.
              </Text>
            ) : (
              <Stack gap="1">
                {parsed.issues.map((issue, i) => (
                  <Text
                    key={`${issue.code}-${i}`}
                    fontSize="xs"
                    color={issue.severity === "error" ? "red.fg" : "yellow.fg"}
                    cursor={issue.siteId ? "pointer" : undefined}
                    onClick={() => issue.siteId && setSelectedSiteId(issue.siteId)}
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
