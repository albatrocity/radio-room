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
} from "@chakra-ui/react"
import { useEffect, useState } from "react"
import {
  INCIDENTS,
  TRIGGERABLE_INCIDENT_IDS,
  type TripMapInput,
  type TripMapIssue,
} from "@repo/road-trip-map"
import type { TripSimRoom } from "@repo/plugin-road-trip/sim"
import { loadDraft, parseDraft } from "../../tripMap/tripMapDraft"
import { listSavedTripMaps, loadSavedTripMap } from "../../tripMap/tripMapFiles"
import {
  describeLogEntry,
  describeSimEvent,
  formatClock,
  formatElapsed,
} from "../../tripSim/describeTripSim"
import { clearTripSim, loadTripSim, runTripSim, useTripSim } from "../../tripSim/tripSimStore"

const DRAFT_SOURCE = "__draft__"

function wholeNumber(value: string): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n > 0 ? n : 0
}

function MapPicker() {
  const [source, setSource] = useState(DRAFT_SOURCE)
  const [savedIds, setSavedIds] = useState<string[]>([])
  const [issues, setIssues] = useState<TripMapIssue[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    void listSavedTripMaps().then(setSavedIds)
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      let input: TripMapInput | null = null
      if (source === DRAFT_SOURCE) {
        input = loadDraft()
      } else {
        const text = await loadSavedTripMap(source)
        try {
          input = text ? (JSON.parse(text) as TripMapInput) : null
        } catch {
          input = null
        }
      }
      if (!input) {
        setIssues([{ severity: "error", code: "load", message: "Couldn't read that map." }])
        return
      }
      const parsed = parseDraft(input, Date.now())
      setIssues(parsed.issues)
      if (parsed.ok) loadTripSim(input)
    } finally {
      setLoading(false)
    }
  }

  const errors = issues.filter((i) => i.severity === "error")

  return (
    <Stack gap="3" borderWidth="1px" borderRadius="md" p="4">
      <Heading size="sm">Map</Heading>
      <HStack gap="2" align="end" wrap="wrap">
        <Field.Root maxW="320px">
          <Field.Label fontSize="xs">Source</Field.Label>
          <NativeSelect.Root size="sm">
            <NativeSelect.Field value={source} onChange={(e) => setSource(e.target.value)}>
              <option value={DRAFT_SOURCE}>Trip map editor draft</option>
              {savedIds.map((id) => (
                <option key={id} value={id}>
                  maps/{id}.json
                </option>
              ))}
            </NativeSelect.Field>
            <NativeSelect.Indicator />
          </NativeSelect.Root>
        </Field.Root>
        <Button size="sm" onClick={() => void load()} loading={loading}>
          Load
        </Button>
      </HStack>
      {errors.length > 0 ? (
        <Stack gap="1">
          <Text fontSize="sm" color="red.fg">
            The map has errors, so the simulator didn't start. Fix them in the Trip map editor.
          </Text>
          {errors.map((issue, i) => (
            <Text key={`${issue.code}-${i}`} fontSize="xs" color="red.fg">
              ✖ {issue.message}
            </Text>
          ))}
        </Stack>
      ) : null}
    </Stack>
  )
}

function Decisions({ room }: { room: TripSimRoom }) {
  const pollSiteId = room.openPollSiteId()
  const pollSite = room.sim.map.sites.find((s) => s.id === pollSiteId)
  const votes = pollSiteId ? room.votesFor(pollSiteId) : null
  const fund = room.state.fund
  const items = room.incidentItems()
  const incident = room.state.incident
  const [pledge, setPledge] = useState("10")

  if (!pollSite && !(fund?.mode === "voluntary") && !incident) {
    return (
      <Text fontSize="sm" color="fg.muted">
        Nothing to decide right now. Exit polls, voluntary funds, and incidents show their
        controls here.
      </Text>
    )
  }

  return (
    <Stack gap="4">
      {pollSite && votes ? (
        <Stack gap="2">
          <Text fontSize="sm" fontWeight="semibold">
            Exit poll: {pollSite.name}
          </Text>
          <Text fontSize="xs" color="fg.muted">
            The poll closes with these votes on the step that closes it. A tie or no votes uses
            the site's default.
          </Text>
          <HStack gap="3">
            <Field.Root maxW="120px">
              <Field.Label fontSize="xs">Pull off</Field.Label>
              <Input
                size="sm"
                type="number"
                min={0}
                value={votes.stop}
                onChange={(e) =>
                  runTripSim((r) => r.setVotes({ ...votes, stop: wholeNumber(e.target.value) }))
                }
              />
            </Field.Root>
            <Field.Root maxW="120px">
              <Field.Label fontSize="xs">Keep driving</Field.Label>
              <Input
                size="sm"
                type="number"
                min={0}
                value={votes.skip}
                onChange={(e) =>
                  runTripSim((r) => r.setVotes({ ...votes, skip: wholeNumber(e.target.value) }))
                }
              />
            </Field.Root>
          </HStack>
        </Stack>
      ) : null}

      {fund?.mode === "voluntary" ? (
        <Stack gap="2">
          <Text fontSize="sm" fontWeight="semibold">
            Voluntary fund: {room.poolRaised()} / {fund.cost} coins
          </Text>
          <HStack gap="2">
            <Input
              size="sm"
              maxW="120px"
              type="number"
              min={1}
              value={pledge}
              onChange={(e) => setPledge(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              disabled={wholeNumber(pledge) === 0}
              onClick={() => runTripSim((r) => r.pledge(wholeNumber(pledge)))}
            >
              Chip in
            </Button>
          </HStack>
          <Text fontSize="xs" color="fg.muted">
            Meeting the goal settles the fund straight away. Otherwise it settles when its window
            ends.
          </Text>
        </Stack>
      ) : null}

      {incident ? (
        <Stack gap="2">
          <Text fontSize="sm" fontWeight="semibold">
            {INCIDENTS[incident.incident].emoji} {INCIDENTS[incident.incident].name} · step{" "}
            {incident.step + 1} of {incident.steps.length} (
            {incident.steps[incident.step]?.kind ?? "done"})
          </Text>
          <HStack gap="2" wrap="wrap">
            {items.map((item) => (
              <Button
                key={item.shortId}
                size="sm"
                variant="outline"
                onClick={() => runTripSim((r) => r.useItem(item.shortId))}
              >
                {item.emoji} Use {item.name}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => runTripSim((r) => r.skipIncidentStep())}>
              Host skip step
            </Button>
          </HStack>
        </Stack>
      ) : null}
    </Stack>
  )
}

function SimPanel({ room }: { room: TripSimRoom }) {
  const { state, sim } = room
  const next = room.peekNext()
  const driving = state.status === "driving"
  const departedAt = state.departedAt
  const log = room.log.filter((entry) => !(entry.kind === "site" && entry.phase === "revealed"))

  return (
    <Stack gap="4">
      <Stack gap="3" borderWidth="1px" borderRadius="md" p="4">
        <HStack justify="space-between" wrap="wrap" gap="2">
          <HStack gap="2">
            <Heading size="sm">{state.map.title}</Heading>
            <Badge>{state.status}</Badge>
          </HStack>
          <HStack gap="2">
            {state.status === "loaded" ? (
              <Button size="sm" onClick={() => runTripSim((r) => r.depart())}>
                Depart
              </Button>
            ) : null}
            <Button
              size="sm"
              colorPalette="blue"
              disabled={!next}
              onClick={() => runTripSim((r) => r.step())}
            >
              Next event
            </Button>
            {driving ? (
              <Button size="sm" variant="outline" onClick={() => runTripSim((r) => r.endTrip())}>
                End trip
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={clearTripSim}>
              Reset
            </Button>
          </HStack>
        </HStack>
        <SimpleGrid columns={{ base: 2, md: 4 }} gap="3">
          <Stat label="Sim clock" value={formatClock(sim.now)} />
          <Stat
            label="Since departure"
            value={departedAt !== undefined ? `T+${formatElapsed(sim.now - departedAt)}` : "—"}
          />
          <Stat
            label="Mile"
            value={`${room.mile().toFixed(1)} / ${state.routeMiles.toFixed(1)}`}
          />
          <Stat label="Speed" value={`${Math.round(sim.current.mph)} mph`} />
        </SimpleGrid>
        <Box>
          <Text fontSize="xs" color="fg.muted">
            Next event
          </Text>
          <Text fontSize="sm">
            {next
              ? `${describeSimEvent(next, sim.map, state)} · in ${formatElapsed(next.at - sim.now)} (${formatClock(next.at)})`
              : state.status === "loaded"
                ? "Depart to start the timeline."
                : "Nothing pending."}
          </Text>
        </Box>
        {driving ? (
          <HStack gap="2" wrap="wrap">
            <Text fontSize="xs" color="fg.muted">
              Host incidents:
            </Text>
            {TRIGGERABLE_INCIDENT_IDS.map((id) => (
              <Button
                key={id}
                size="xs"
                variant="outline"
                onClick={() => runTripSim((r) => r.triggerIncident(id))}
              >
                {INCIDENTS[id].emoji} {INCIDENTS[id].name}
              </Button>
            ))}
          </HStack>
        ) : null}
      </Stack>

      <SimpleGrid columns={{ base: 1, md: 2 }} gap="4">
        <Stack gap="3" borderWidth="1px" borderRadius="md" p="4">
          <Heading size="sm">Decisions</Heading>
          <Decisions room={room} />
        </Stack>
        <Stack gap="2" borderWidth="1px" borderRadius="md" p="4" maxH="420px" overflowY="auto">
          <Heading size="sm">Timeline</Heading>
          {log.length === 0 ? (
            <Text fontSize="sm" color="fg.muted">
              No events yet.
            </Text>
          ) : (
            [...log].reverse().map((entry, i) => (
              <HStack key={`${entry.at}-${i}`} gap="3" align="start" fontSize="sm">
                <Text color="fg.muted" minW="72px" fontFamily="mono" fontSize="xs" pt="0.5">
                  {departedAt !== undefined ? `T+${formatElapsed(entry.at - departedAt)}` : ""}
                </Text>
                <Text color="fg.muted" minW="56px" fontFamily="mono" fontSize="xs" pt="0.5">
                  mi {entry.mile.toFixed(1)}
                </Text>
                <Text>{describeLogEntry(entry)}</Text>
              </HStack>
            ))
          )}
        </Stack>
      </SimpleGrid>
    </Stack>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Text fontSize="xs" color="fg.muted">
        {label}
      </Text>
      <Text fontSize="sm" fontFamily="mono">
        {value}
      </Text>
    </Box>
  )
}

/**
 * Trip simulator (ADR 0213): step a Trip Map one timeline event at a time with
 * the real trip runtime, and mirror each step into the Room UI preview through
 * studio-bridge. Decisions are made here; the room is read-only.
 */
export function TripSimPage() {
  const { room } = useTripSim()

  return (
    <Stack gap="4">
      <Text fontSize="sm" color="fg.muted">
        Load a map, depart, and step through its timeline. Each step updates{" "}
        <code>studio-room</code> in the Room UI preview (run <code>make game-studio</code>). Votes,
        chip-ins, and item uses in the room don't change the simulation; make them here.
      </Text>
      <MapPicker />
      {room ? <SimPanel room={room} /> : null}
    </Stack>
  )
}
