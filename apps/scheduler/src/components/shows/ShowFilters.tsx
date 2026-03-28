import { useMemo } from "react"
import { HStack, Input, Box, Select, createListCollection } from "@chakra-ui/react"
import type { ShowFilters as ShowFiltersType, ShowStatus } from "@repo/types"

interface ShowFiltersProps {
  filters: ShowFiltersType
  onChange: (filters: ShowFiltersType) => void
}

const STATUS_ITEMS = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "published", label: "Published" },
] as const

export function ShowFilters({ filters, onChange }: ShowFiltersProps) {
  const statusCollection = useMemo(() => createListCollection({ items: [...STATUS_ITEMS] }), [])

  return (
    <HStack gap={3} flexWrap="wrap" align="flex-end">
      <Input
        placeholder="Search shows..."
        value={filters.search ?? ""}
        onChange={(e) => onChange({ ...filters, search: e.target.value || undefined })}
        maxW="300px"
        size="sm"
      />
      <Input
        type="date"
        value={filters.startDate ?? ""}
        onChange={(e) => onChange({ ...filters, startDate: e.target.value || undefined })}
        size="sm"
        maxW="180px"
      />
      <Box fontSize="sm" color="fg.muted" alignSelf="center">
        to
      </Box>
      <Input
        type="date"
        value={filters.endDate ?? ""}
        onChange={(e) => onChange({ ...filters, endDate: e.target.value || undefined })}
        size="sm"
        maxW="180px"
      />
      <Select.Root
        aria-label="Filter by status"
        collection={statusCollection}
        size="sm"
        minW="150px"
        maxW="200px"
        value={[filters.status ?? ""]}
        onValueChange={(e) => {
          const raw = e.value[0] ?? ""
          const status = raw === "" ? undefined : (raw as ShowStatus)
          onChange({ ...filters, status })
        }}
      >
        <Select.HiddenSelect />
        <Select.Control>
          <Select.Trigger>
            <Select.ValueText placeholder="Status" />
          </Select.Trigger>
          <Select.IndicatorGroup>
            <Select.Indicator />
          </Select.IndicatorGroup>
        </Select.Control>
        <Select.Positioner>
          <Select.Content>
            <Select.List>
              {statusCollection.items.map((item) => (
                <Select.Item key={item.value === "" ? "all" : item.value} item={item}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator />
                </Select.Item>
              ))}
            </Select.List>
          </Select.Content>
        </Select.Positioner>
      </Select.Root>
    </HStack>
  )
}
