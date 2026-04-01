import {
  Box,
  Button,
  Drawer,
  Heading,
  HStack,
  Input,
  Text,
  Textarea,
  Badge,
  VStack,
  CloseButton,
  Separator,
} from "@chakra-ui/react"
import { useForm } from "@tanstack/react-form"
import { useSegment, useUpdateSegment, useDeleteSegment } from "../../hooks/useSegments"
import type { SegmentDTO, SegmentStatus } from "@repo/types"
import { TagCombobox } from "../tags/TagCombobox"
import { SegmentPluginPresetEditor } from "./SegmentPluginPresetEditor"
import { SegmentRoomSettingsEditor } from "./SegmentRoomSettingsEditor"

interface SegmentDetailDrawerProps {
  segmentId: string | undefined
  open: boolean
  onClose: () => void
}

const STATUS_OPTIONS: { value: SegmentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "archived", label: "Archived" },
]

function segmentToFormDefaults(segment: SegmentDTO) {
  return {
    title: segment.title,
    description: segment.description ?? "",
    durationMinutes:
      segment.duration !== null && segment.duration !== undefined ? String(segment.duration) : "",
    isRecurring: segment.isRecurring,
    status: segment.status,
    tagIds: segment.tags?.map((t) => t.id) ?? [],
    pluginPreset: segment.pluginPreset,
    roomSettingsOverride: segment.roomSettingsOverride ?? null,
  }
}

interface SegmentDetailFormProps {
  segment: SegmentDTO
  onClose: () => void
}

function SegmentDetailForm({ segment, onClose }: SegmentDetailFormProps) {
  const updateSegment = useUpdateSegment()
  const deleteSegment = useDeleteSegment()

  const form = useForm({
    defaultValues: segmentToFormDefaults(segment),
    onSubmit: async ({ value }) => {
      const raw = value.durationMinutes.trim()
      let duration: number | null = null
      if (raw !== "") {
        const n = parseInt(raw, 10)
        if (Number.isFinite(n) && n >= 0) duration = n
      }
      await updateSegment.mutateAsync({
        id: segment.id,
        title: value.title,
        description: value.description || null,
        duration,
        isRecurring: value.isRecurring,
        status: value.status,
        tagIds: value.tagIds,
        pluginPreset: value.pluginPreset,
        roomSettingsOverride: value.roomSettingsOverride,
      })
      onClose()
    },
  })

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
    >
      <VStack gap={4} align="stretch">
        <form.Field name="title">
          {(field) => (
            <Box>
              <Box mb={1} fontSize="sm" fontWeight="medium">
                Title
              </Box>
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
              />
            </Box>
          )}
        </form.Field>

        <form.Field name="description">
          {(field) => (
            <Box>
              <Box mb={1} fontSize="sm" fontWeight="medium">
                Description
              </Box>
              <Textarea
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                rows={4}
              />
            </Box>
          )}
        </form.Field>

        <form.Field name="durationMinutes">
          {(field) => (
            <Box>
              <Box mb={1} fontSize="sm" fontWeight="medium">
                Approx. duration (minutes)
              </Box>
              <Input
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                placeholder="Optional"
                inputMode="numeric"
              />
            </Box>
          )}
        </form.Field>

        <form.Field name="status">
          {(field) => (
            <Box>
              <Box mb={1} fontSize="sm" fontWeight="medium">
                Status
              </Box>
              <select
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value as SegmentStatus)}
                style={{
                  width: "100%",
                  padding: "8px",
                  borderRadius: "6px",
                  border: "1px solid var(--chakra-colors-border-muted)",
                  background: "var(--chakra-colors-bg-panel)",
                  color: "inherit",
                }}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </Box>
          )}
        </form.Field>

        <form.Field name="isRecurring">
          {(field) => (
            <HStack>
              <input
                type="checkbox"
                checked={field.state.value}
                onChange={(e) => field.handleChange(e.target.checked)}
              />
              <Box fontSize="sm">Recurring segment</Box>
            </HStack>
          )}
        </form.Field>

        <Box>
          <form.Field name="tagIds">
            {(field) => (
              <TagCombobox
                tagType="segment"
                value={field.state.value}
                onValueChange={field.handleChange}
                insideOverlay
              />
            )}
          </form.Field>
        </Box>

        <form.Field name="pluginPreset">
          {(field) => (
            <SegmentPluginPresetEditor value={field.state.value} onChange={field.handleChange} />
          )}
        </form.Field>

        <form.Field name="roomSettingsOverride">
          {(field) => (
            <SegmentRoomSettingsEditor value={field.state.value} onChange={field.handleChange} />
          )}
        </form.Field>

        <HStack gap={2}>
          <Button type="submit" colorPalette="blue" loading={updateSegment.isPending}>
            Save
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </HStack>

        {segment.shows && segment.shows.length > 0 && (
          <>
            <Separator />
            <Box>
              <Heading size="sm" mb={2}>
                Scheduled in Shows
              </Heading>
              <VStack gap={2} align="stretch">
                {segment.shows.map((show) => (
                  <HStack key={show.id} justify="space-between">
                    <Text fontSize="sm">{show.title}</Text>
                    <Badge size="sm">{show.status}</Badge>
                  </HStack>
                ))}
              </VStack>
            </Box>
          </>
        )}

        <Separator />
        <Button
          variant="outline"
          colorPalette="red"
          size="sm"
          onClick={async () => {
            await deleteSegment.mutateAsync(segment.id)
            onClose()
          }}
          loading={deleteSegment.isPending}
        >
          Delete Segment
        </Button>
      </VStack>
    </form>
  )
}

export function SegmentDetailDrawer({ segmentId, open, onClose }: SegmentDetailDrawerProps) {
  const { data: segment, isLoading } = useSegment(segmentId ?? "")

  return (
    <Drawer.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="md">
      <Drawer.Backdrop />
      <Drawer.Positioner>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Segment Details</Drawer.Title>
            <Drawer.CloseTrigger asChild position="absolute" top={3} right={3}>
              <CloseButton size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Header>
          <Drawer.Body>
            {isLoading ? (
              <Text>Loading...</Text>
            ) : segment ? (
              <SegmentDetailForm key={segment.id} segment={segment} onClose={onClose} />
            ) : segmentId ? (
              <Text>Segment not found</Text>
            ) : null}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  )
}
