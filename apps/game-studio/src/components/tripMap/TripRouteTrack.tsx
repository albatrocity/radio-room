import { Box, Button, HStack, Text } from "@chakra-ui/react"
import { useMemo, useRef, useState, type ReactNode } from "react"
import {
  MAIN_ROUTE_ID,
  eventTrigger,
  isDestination,
  revealMileAtBaseSpeed,
  type TripMap,
  type TripMapInput,
} from "@repo/road-trip-map"
import { routeLabel, trackLayout, type TrackRow } from "../../tripMap/branchesDraft"

export type TrackSelection =
  | { kind: "site"; id: string }
  | { kind: "event"; id: string }
  | { kind: "route"; id: string }
  | { kind: "layer"; id: string }
  | null

type Props = {
  draft: TripMapInput
  /** Resolved map for reveal ticks; null while the draft doesn't parse. */
  resolved: TripMap | null
  selection: TrackSelection
  onSelect: (selection: TrackSelection) => void
  /** Miles are local to the pin's own route. */
  onMoveSite: (siteId: string, mile: number) => void
  onMoveEvent: (eventId: string, mile: number) => void
  /** Fork mile on the parent route, rejoin mile on the target route. */
  onMoveFork: (routeId: string, mile: number) => void
  onMoveEnd: (routeId: string, mile: number) => void
}

const ROW_HEIGHT = 84
const LINE_Y = 34

type Band = { key: string; row: TrackRow; layer?: string; top: number }

type Pin = {
  key: string
  select: TrackSelection
  icon: string
  mile: number
  label: string
  below: boolean
  draggable: boolean
  marked?: boolean
  onMove: (mile: number) => void
}

/**
 * The trip on one mile scale (ADR 0222): the main road, each alternate route
 * as its own row starting at its fork, and each layer's stops as a thin
 * sub-row under their route. Site pins sit above a line, mile events below;
 * forks and rejoins drag along their road.
 */
export function TripRouteTrack({
  draft,
  resolved,
  selection,
  onSelect,
  onMoveSite,
  onMoveEvent,
  onMoveFork,
  onMoveEnd,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [hidden, setHidden] = useState<Set<string>>(() => new Set())
  const { rows, scale } = useMemo(() => trackLayout(draft), [draft])
  const events = (draft.events ?? []).filter(
    (event) => eventTrigger(event) === "mile" && event.mile !== undefined,
  )

  const routeOf = (item: { route?: string }) => item.route ?? MAIN_ROUTE_ID
  const bands: Band[] = []
  for (const row of rows) {
    bands.push({ key: row.route, row, top: bands.length * ROW_HEIGHT })
    const layers = (draft.layers ?? []).filter(
      (layer) =>
        draft.sites.some((s) => s.layer === layer.id && routeOf(s) === row.route) ||
        events.some((e) => e.layer === layer.id && routeOf(e) === row.route),
    )
    for (const layer of layers) {
      bands.push({ key: `${row.route}:${layer.id}`, row, layer: layer.id, top: bands.length * ROW_HEIGHT })
    }
  }
  const bandOf = (route: string, layer?: string) =>
    bands.find((b) => b.row.route === route && b.layer === (layer ?? undefined))
  const height = bands.length * ROW_HEIGHT

  const pct = (shared: number) => Math.min(100, Math.max(0, (shared / scale) * 100))
  const sharedAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0) return 0
    return ((clientX - rect.left) / rect.width) * scale
  }
  const isSelected = (select: TrackSelection) =>
    selection !== null && select !== null && selection.kind === select.kind && selection.id === select.id

  const drag = (key: string, onMove: (clientX: number) => void) => ({
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId)
      setDragging(key)
    },
    onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
      e.currentTarget.releasePointerCapture(e.pointerId)
      setDragging(null)
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      if (dragging === key) onMove(e.clientX)
    },
  })

  const pinsFor = (band: Band): Pin[] => {
    if (band.layer && hidden.has(band.layer)) return []
    const route = band.row.route
    const sites = draft.sites
      .filter((site) => routeOf(site) === route && (site.layer ?? undefined) === band.layer)
      .map(
        (site): Pin => ({
          key: `site:${site.id}`,
          select: { kind: "site", id: site.id },
          icon: site.icon || "📍",
          mile: site.mile,
          label: site.mile.toFixed(1),
          below: false,
          draggable: !isDestination(site),
          marked: site.mandatory === true || isDestination(site),
          onMove: (mile) => onMoveSite(site.id, mile),
        }),
      )
    const pins = events
      .filter((event) => routeOf(event) === route && (event.layer ?? undefined) === band.layer)
      .map(
        (event): Pin => ({
          key: `event:${event.id}`,
          select: { kind: "event", id: event.id },
          icon: event.icon || "⚠️",
          mile: event.mile!,
          label: event.mile!.toFixed(1),
          below: true,
          draggable: true,
          onMove: (mile) => onMoveEvent(event.id, mile),
        }),
      )
    return [...sites, ...pins]
  }

  const handle = (key: string, children: ReactNode, x: number, y: number, title: string, select: TrackSelection, onMove?: (clientX: number) => void) => (
    <Box
      key={key}
      position="absolute"
      top={`${y}px`}
      left={`${pct(x)}%`}
      transform="translate(-50%, -50%)"
      cursor={onMove ? "grab" : "pointer"}
      userSelect="none"
      touchAction="none"
      title={title}
      zIndex={2}
      fontSize="sm"
      lineHeight="1"
      px="1"
      borderRadius="sm"
      bg="bg"
      borderWidth={isSelected(select) ? "2px" : "1px"}
      borderColor={isSelected(select) ? "blue.solid" : "border.emphasized"}
      onClick={() => onSelect(select)}
      {...(onMove ? drag(key, onMove) : {})}
    >
      {children}
    </Box>
  )

  return (
    <Box>
      <Box ref={trackRef} position="relative" h={`${height}px`} mx="4">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
        >
          {rows.map((row) => {
            const band = bandOf(row.route)!
            const y = band.top + LINE_Y
            const lines: ReactNode[] = []
            if (row.fork) {
              const parent = bandOf(row.fork.route)
              if (parent) {
                lines.push(
                  <line
                    key={`${row.route}-fork`}
                    x1={pct(row.x)}
                    y1={parent.top + LINE_Y}
                    x2={pct(row.x)}
                    y2={y}
                    stroke="currentColor"
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />,
                )
              }
            }
            const end = row.end
            if (end && "route" in end) {
              const target = bandOf(end.route)
              const targetRow = rows.find((r) => r.route === end.route)
              if (target && targetRow) {
                lines.push(
                  <line
                    key={`${row.route}-end`}
                    x1={pct(row.x + row.length)}
                    y1={y}
                    x2={pct(targetRow.x + end.mile)}
                    y2={target.top + LINE_Y}
                    stroke="currentColor"
                    strokeDasharray="3 3"
                    vectorEffect="non-scaling-stroke"
                  />,
                )
              }
            }
            return <g key={row.route} opacity={0.5}>{lines}</g>
          })}
        </svg>

        {bands.map((band) => {
          const layer = band.layer ? draft.layers?.find((l) => l.id === band.layer) : undefined
          const select: TrackSelection = layer
            ? { kind: "layer", id: layer.id }
            : band.row.route === MAIN_ROUTE_ID
              ? null
              : { kind: "route", id: band.row.route }
          return (
            <Box key={`line-${band.key}`}>
              <Box
                position="absolute"
                top={`${band.top + LINE_Y}px`}
                left={`${pct(band.row.x)}%`}
                width={`${pct(band.row.length)}%`}
                borderTopWidth={layer ? "1px" : "3px"}
                borderStyle={layer ? "dashed" : "solid"}
                borderColor={isSelected(select) ? "blue.solid" : layer ? "purple.muted" : "fg.muted"}
              />
              <HStack
                position="absolute"
                top={`${band.top + LINE_Y + 4}px`}
                left={`${pct(band.row.x)}%`}
                gap="1"
                zIndex={1}
              >
                <Text
                  fontSize="2xs"
                  color={layer ? "purple.fg" : "fg.muted"}
                  cursor={select ? "pointer" : undefined}
                  whiteSpace="nowrap"
                  onClick={() => select && onSelect(select)}
                >
                  {layer ? `${layer.icon} ${layer.name}` : routeLabel(draft, band.row.route)}
                </Text>
                {layer ? (
                  <Button
                    size="2xs"
                    variant="ghost"
                    h="4"
                    px="1"
                    onClick={() =>
                      setHidden((h) => {
                        const next = new Set(h)
                        if (next.has(layer.id)) next.delete(layer.id)
                        else next.add(layer.id)
                        return next
                      })
                    }
                  >
                    {hidden.has(layer.id) ? "show" : "hide"}
                  </Button>
                ) : null}
              </HStack>
              {!layer && resolved
                ? resolved.sites
                    .filter((s) => routeOf(s) === band.row.route && !s.layer && !isDestination(s))
                    .map((site) => (
                      <Box
                        key={`tick-${site.id}`}
                        position="absolute"
                        top={`${band.top + LINE_Y - 6}px`}
                        left={`${pct(band.row.x + revealMileAtBaseSpeed(resolved, site))}%`}
                        h="15px"
                        borderLeftWidth="1px"
                        borderColor="fg.subtle"
                        opacity={0.6}
                        title={`${site.name} reveals here`}
                      />
                    ))
                : null}
              {pinsFor(band).map((pin) => (
                <Box
                  key={pin.key}
                  position="absolute"
                  top={pin.below ? `${band.top + LINE_Y + 4}px` : `${band.top}px`}
                  left={`${pct(band.row.x + pin.mile)}%`}
                  transform="translateX(-50%)"
                  textAlign="center"
                  cursor={pin.draggable ? "grab" : "pointer"}
                  userSelect="none"
                  touchAction="none"
                  zIndex={3}
                  onPointerDown={(e) => {
                    onSelect(pin.select)
                    if (!pin.draggable) return
                    e.currentTarget.setPointerCapture(e.pointerId)
                    setDragging(pin.key)
                  }}
                  onPointerUp={(e) => {
                    e.currentTarget.releasePointerCapture(e.pointerId)
                    setDragging(null)
                  }}
                  onPointerMove={(e) => {
                    if (dragging === pin.key) pin.onMove(sharedAt(e.clientX) - band.row.x)
                  }}
                >
                  {pin.below ? (
                    <Box mx="auto" h="8px" w="0" borderLeftWidth="2px" borderStyle="dashed" borderColor="orange.solid" />
                  ) : null}
                  <Text
                    fontSize={pin.below ? "md" : "xl"}
                    lineHeight="1"
                    px="1"
                    borderRadius="md"
                    borderWidth={isSelected(pin.select) ? "2px" : pin.below ? "1px" : "0"}
                    borderColor={isSelected(pin.select) ? "blue.solid" : "orange.muted"}
                    bg="bg"
                  >
                    {pin.icon}
                  </Text>
                  {!pin.below ? (
                    <Box mx="auto" mt="2px" h="10px" w="2px" bg={pin.marked ? "red.solid" : "fg.muted"} />
                  ) : null}
                  <Text fontSize="2xs" color={pin.below ? "orange.fg" : "fg.muted"} whiteSpace="nowrap">
                    {pin.label}
                  </Text>
                </Box>
              ))}
            </Box>
          )
        })}

        {rows.flatMap((row) => {
          const route = draft.routes?.find((r) => r.id === row.route)
          if (!route || !row.fork) return []
          const parent = bandOf(row.fork.route)
          const parentRow = rows.find((r) => r.route === row.fork!.route)
          const own = bandOf(row.route)!
          const select: TrackSelection = { kind: "route", id: route.id }
          const out: ReactNode[] = []
          if (parent && parentRow) {
            out.push(
              handle(`fork:${route.id}`, "◆", row.x, parent.top + LINE_Y, `${route.name} forks here (drag)`, select, (clientX) =>
                onMoveFork(route.id, sharedAt(clientX) - parentRow.x),
              ),
            )
          }
          const end = row.end
          if (end && "route" in end) {
            const target = bandOf(end.route)
            const targetRow = rows.find((r) => r.route === end.route)
            if (target && targetRow) {
              out.push(
                handle(`end:${route.id}`, "⤵", targetRow.x + end.mile, target.top + LINE_Y, `${route.name} rejoins here (drag)`, select, (clientX) =>
                  onMoveEnd(route.id, sharedAt(clientX) - targetRow.x),
                ),
              )
            }
          } else {
            out.push(handle(`flag:${route.id}`, "🏁", row.x + row.length, own.top + LINE_Y, `${route.name} ends at its own destination`, select))
          }
          return out
        })}
      </Box>
      <HStack justify="space-between" fontSize="xs" color="fg.muted" px="1">
        <Text>0 mi · depart</Text>
        <Text>{scale.toFixed(1)} mi</Text>
      </HStack>
    </Box>
  )
}
