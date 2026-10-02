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
import { SAMPLE_TRIP_MAP, type TripMapInput } from "@repo/road-trip-map"
import { toaster } from "../ui/toaster"
import { useDebouncedValue } from "../../hooks/useDebouncedValue"
import {
  SITE_LIBRARY,
  addSiteFromPreset,
  draftRouteMiles,
  loadDraft,
  mapJson,
  moveSite,
  parseDraft,
  projectTrip,
  removeSite,
  resolvedMap,
  saveDraft,
  updateRoute,
  updateSite,
} from "../../tripMap/tripMapDraft"
import { listSavedTripMaps, loadSavedTripMap, saveTripMapFile } from "../../tripMap/tripMapFiles"
import { TripRouteTrack } from "./TripRouteTrack"
import { TripSiteInspector } from "./TripSiteInspector"

function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000)
  return d.toISOString().slice(0, 16)
}

function minutesLabel(minutes: number): string {
  return `${Math.round(minutes)} min`
}

/**
 * Trip Map editor v1 (M8, Phase 1): route, site pins, inspector, shop picker,
 * projections, lint, and Copy JSON / save `maps/<id>.json`. Runs no plugin code;
 * only pure `@repo/road-trip-map` modules.
 */
const LINT_DEBOUNCE_MS = 250

export function TripMapEditor() {
  const [draft, setDraft] = useState<TripMapInput>(loadDraft)
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null)
  const [departAt, setDepartAt] = useState(() => Date.now())
  const [importText, setImportText] = useState("")
  const [savedIds, setSavedIds] = useState<string[]>([])

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
          routeMiles={miles}
          resolved={resolved}
          selectedSiteId={selectedSiteId}
          onSelect={setSelectedSiteId}
          onMove={(siteId, mile) => setDraft((d) => moveSite(d, siteId, mile))}
        />
      </Box>

      <SimpleGrid columns={{ base: 1, lg: 3 }} gap="4" alignItems="start">
        <Box gridColumn={{ lg: "span 2" }} borderWidth="1px" borderRadius="md" p="3">
          {selected ? (
            <TripSiteInspector
              site={selected}
              resolved={resolved}
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
