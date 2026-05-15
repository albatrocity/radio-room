import { Box, Button, HStack, Spinner, Stack, Table, Text } from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { useMemo } from "react"
import {
  useAdminListenerError,
  useAdminListenerLoading,
  useAdminListenerPayload,
  refreshAdminListenerState,
} from "../../../hooks/useActors"

function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n)
}

const EMPTY_DEFINITIONS: ItemDefinition[] = []

function formatItemCell(
  items: InventoryItem[],
  definitionMap: Map<string, ItemDefinition>,
): string {
  if (items.length === 0) return "—"
  return items
    .map((it) => {
      const name = definitionMap.get(it.definitionId)?.name ?? it.definitionId
      return it.quantity > 1 ? `${name} ×${formatNumber(it.quantity)}` : name
    })
    .join(", ")
}

/**
 * Room admin: table of session participants with score, coins, and inventory.
 */
export default function AdminListenersTab() {
  const payload = useAdminListenerPayload()
  const loading = useAdminListenerLoading()
  const error = useAdminListenerError()

  const definitionMap = useMemo(() => {
    const map = new Map<string, ItemDefinition>()
    for (const def of payload?.itemDefinitions ?? EMPTY_DEFINITIONS) {
      map.set(def.id, def)
    }
    return map
  }, [payload?.itemDefinitions])

  const rows = useMemo(() => {
    const list = payload?.listeners ?? []
    return [...list].sort((a, b) =>
      a.username.localeCompare(b.username, undefined, { sensitivity: "base" }),
    )
  }, [payload?.listeners])

  if (loading && !payload) {
    return (
      <HStack py={2}>
        <Spinner size="sm" />
        <Text fontSize="sm" color="fg.muted">
          Loading listener stats…
        </Text>
      </HStack>
    )
  }

  if (error && !payload) {
    return (
      <Stack gap={3}>
        <Text fontSize="sm" color="red.500">
          {error}
        </Text>
        <Button size="sm" variant="outline" onClick={() => refreshAdminListenerState()}>
          Retry
        </Button>
      </Stack>
    )
  }

  if (!payload?.session) {
    return (
      <Text fontSize="sm" color="fg.muted">
        No game session is running. Start a session in room settings to see listener stats.
      </Text>
    )
  }

  if (rows.length === 0) {
    return (
      <Stack gap={3}>
        <Text fontSize="sm" color="fg.muted">
          No session participants yet. Listeners appear here after they earn score, coins, or
          items during this session.
        </Text>
        <Button
          size="sm"
          variant="outline"
          alignSelf="flex-start"
          loading={loading}
          onClick={() => refreshAdminListenerState()}
        >
          Refresh
        </Button>
      </Stack>
    )
  }

  return (
    <Stack gap={3}>
      <HStack justify="flex-end">
        <Button size="xs" variant="ghost" loading={loading} onClick={() => refreshAdminListenerState()}>
          Refresh
        </Button>
      </HStack>
      <Box overflowX="auto" w="full" borderWidth="1px" borderRadius="md" borderColor="border.muted">
        <Table.Root size="sm" variant="line">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Listener</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">Score</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">Coins</Table.ColumnHeader>
              <Table.ColumnHeader>Items</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((row) => (
              <Table.Row key={row.userId}>
                <Table.Cell>
                  <Text fontWeight="medium">{row.username}</Text>
                </Table.Cell>
                <Table.Cell textAlign="end">
                  {formatNumber(row.state.attributes.score ?? 0)}
                </Table.Cell>
                <Table.Cell textAlign="end">
                  {formatNumber(row.state.attributes.coin ?? 0)}
                </Table.Cell>
                <Table.Cell>
                  <Text fontSize="sm" color="fg.muted">
                    {formatItemCell(row.inventory.items, definitionMap)}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Box>
    </Stack>
  )
}
