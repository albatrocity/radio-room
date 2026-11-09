import { Box, Stack, Table, Text } from "@chakra-ui/react"
import type { TripFlowOutline } from "@repo/road-trip-map"

type Props = {
  /** Null while the draft doesn't parse. */
  outline: TripFlowOutline | null
  onSelectRoute: (routeId: string) => void
  onSelectLayer: (layerId: string) => void
  onSelectMap: (mapId: string) => void
  onSelectKey: (keyId: string) => void
}

function round1(value: number): string {
  return (Math.round(value * 10) / 10).toString()
}

function routeName(outline: TripFlowOutline, id: string): string {
  return id === "main" ? "the main road" : (outline.routes.find((r) => r.id === id)?.name ?? id)
}

/**
 * How the trip flows (ADR 0222): every fork and what takes it, every layer
 * and what unlocks it, and each path through the forks with its length,
 * stops, and fuel if nobody votes. From `describeTripFlow`, which lint reads too.
 */
export function TripFlowPanel({
  outline,
  onSelectRoute,
  onSelectLayer,
  onSelectMap,
  onSelectKey,
}: Props) {
  if (!outline) {
    return (
      <Text fontSize="sm" color="fg.muted">
        Fix schema errors to see the flow.
      </Text>
    )
  }
  const linear = outline.routes.length === 0 && outline.layers.length === 0
  return (
    <Stack gap="3" fontSize="xs">
      {linear ? (
        <Text color="fg.muted">
          One road, no layers. Add a route for a fork the room votes on, or a layer for stops that
          stay hidden until something unlocks them.
        </Text>
      ) : null}
      {outline.routes.map((route) => (
        <Box key={route.id} cursor="pointer" onClick={() => onSelectRoute(route.id)}>
          <Text fontWeight="semibold">
            {route.icon ?? "🛣️"} {route.name} · {round1(route.miles)} mi
          </Text>
          <Text color="fg.muted">
            Forks off {routeName(outline, route.from.route)} at mile {round1(route.from.mile)};{" "}
            {route.end.kind === "rejoin"
              ? `rejoins ${routeName(outline, route.end.route)} at mile ${round1(route.end.mile)}`
              : "ends at its own destination"}
            .
          </Text>
          <Text color="fg.muted">
            {route.entry.kind === "vote"
              ? `The room votes${route.entry.mystery ? " (mystery)" : ""}; no votes = ${route.entry.default === "take" ? "take it" : "stay"}.`
              : route.divertedBy.length > 0
                ? `Taken when diverted by ${route.divertedBy.join(", ")}.`
                : "Nothing diverts to it yet."}
            {route.layer ? ` Exists only while ${route.layer} is unlocked.` : ""}
          </Text>
        </Box>
      ))}
      {outline.layers.map((layer) => (
        <Box key={layer.id} cursor="pointer" onClick={() => onSelectLayer(layer.id)}>
          <Text fontWeight="semibold">
            {layer.icon} {layer.name}
          </Text>
          <Text color="fg.muted">
            Unlocked by{" "}
            {[...layer.unlockedBy, ...layer.maps].join(", ") || "nothing (it never appears)"}
            {layer.lockedBy.length > 0 ? `; locked by ${layer.lockedBy.join(", ")}` : ""}.
          </Text>
          <Text color="fg.muted">
            {[...layer.sites, ...layer.events, ...layer.forks.map((f) => `${f} fork`)].join(", ") ||
              "Empty."}
          </Text>
        </Box>
      ))}
      {outline.keyItems.map((key) => (
        <Box key={key.id} cursor="pointer" onClick={() => onSelectKey(key.id)}>
          <Text fontWeight="semibold">
            {key.icon} {key.name} · key item
          </Text>
          <Text color="fg.muted">
            Given by {key.givenBy.join(", ") || "nothing"}; taken by{" "}
            {key.takenBy.join(", ") || "nothing"}; sold at {key.soldAt.join(", ") || "no site"};
            read by {key.readBy.join(", ") || "nothing"}.
          </Text>
        </Box>
      ))}
      {outline.maps.map((item) => (
        <Box key={item.id} cursor="pointer" onClick={() => onSelectMap(item.id)}>
          <Text fontWeight="semibold">
            {item.icon} {item.name} · map
          </Text>
          <Text color="fg.muted">
            Reveals {item.layers.join(", ") || "nothing yet"}; sold at{" "}
            {item.soldAt.join(", ") || "no site yet"}.
          </Text>
        </Box>
      ))}
      <Box>
        <Text fontWeight="semibold" mb="1">
          Paths if nobody votes{outline.layers.length > 0 ? ", every layer unlocked" : ""}
        </Text>
        <Table.Root size="sm" variant="outline">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Path</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">Miles</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">Minutes</Table.ColumnHeader>
              <Table.ColumnHeader>Fuel</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {outline.paths.map((path) => (
              <Table.Row key={path.label}>
                <Table.Cell>
                  {path.label}
                  {path.destination ? ` → ${path.destination}` : ""}
                </Table.Cell>
                <Table.Cell textAlign="end">{round1(path.miles)}</Table.Cell>
                <Table.Cell textAlign="end">
                  {Math.round(path.driveMinutes + path.expectedParkMinutes)}
                </Table.Cell>
                <Table.Cell color={path.emptyAtMile !== null ? "red.fg" : undefined}>
                  {path.emptyAtMile !== null ? `dry at mile ${round1(path.emptyAtMile)}` : "ok"}
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
        {outline.capped ? (
          <Text color="yellow.fg" mt="1">
            Too many forks to list every path; showing the main road.
          </Text>
        ) : null}
      </Box>
    </Stack>
  )
}
