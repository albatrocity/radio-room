import { HStack, Input, Box } from "@chakra-ui/react"
import type { ShowFilters as ShowFiltersType, ShowStatus } from "@repo/types"

interface ShowFiltersProps {
  filters: ShowFiltersType
  onChange: (filters: ShowFiltersType) => void
}

const STATUS_OPTIONS: { value: ShowStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "published", label: "Published" },
]

export function ShowFilters({ filters, onChange }: ShowFiltersProps) {
  return (
    <HStack gap={3} flexWrap="wrap">
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
      <select
        value={filters.status ?? ""}
        onChange={(e) =>
          onChange({ ...filters, status: (e.target.value || undefined) as ShowStatus | undefined })
        }
        style={{
          padding: "4px 8px",
          borderRadius: "6px",
          border: "1px solid var(--chakra-colors-border-muted)",
          background: "var(--chakra-colors-bg-panel)",
          color: "inherit",
          fontSize: "14px",
        }}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </HStack>
  )
}
