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
import { useTags } from "../../hooks/useTags"
import type { SegmentStatus } from "@repo/types"

interface SegmentDetailDrawerProps {
  segmentId: string | null
  open: boolean
  onClose: () => void
}

const STATUS_OPTIONS: { value: SegmentStatus; label: string }[] = [
  { value: "draft", label: "Draft" },
  { value: "working", label: "Working" },
  { value: "ready", label: "Ready" },
  { value: "archived", label: "Archived" },
]

export function SegmentDetailDrawer({ segmentId, open, onClose }: SegmentDetailDrawerProps) {
  const { data: segment, isLoading } = useSegment(segmentId ?? "")
  const updateSegment = useUpdateSegment()
  const deleteSegment = useDeleteSegment()
  const { data: allTags } = useTags("segment")

  const form = useForm({
    defaultValues: {
      title: segment?.title ?? "",
      description: segment?.description ?? "",
      isRecurring: segment?.isRecurring ?? false,
      status: (segment?.status ?? "draft") as SegmentStatus,
      tagIds: segment?.tags?.map((t) => t.id) ?? [],
    },
    onSubmit: async ({ value }) => {
      if (!segmentId) return
      await updateSegment.mutateAsync({
        id: segmentId,
        title: value.title,
        description: value.description || null,
        isRecurring: value.isRecurring,
        status: value.status,
        tagIds: value.tagIds,
      })
      onClose()
    },
  })

  // Reset form when segment data changes
  if (segment && form.state.values.title === "" && segment.title !== "") {
    form.reset({
      title: segment.title,
      description: segment.description ?? "",
      isRecurring: segment.isRecurring,
      status: segment.status,
      tagIds: segment.tags?.map((t) => t.id) ?? [],
    })
  }

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
                        <Box mb={1} fontSize="sm" fontWeight="medium">Title</Box>
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
                        <Box mb={1} fontSize="sm" fontWeight="medium">Description</Box>
                        <Textarea
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                          rows={4}
                        />
                      </Box>
                    )}
                  </form.Field>

                  <form.Field name="status">
                    {(field) => (
                      <Box>
                        <Box mb={1} fontSize="sm" fontWeight="medium">Status</Box>
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

                  {allTags && allTags.length > 0 && (
                    <Box>
                      <Box mb={1} fontSize="sm" fontWeight="medium">Tags</Box>
                      <HStack gap={2} flexWrap="wrap">
                        <form.Field name="tagIds">
                          {(field) =>
                            allTags.map((tag) => {
                              const selected = field.state.value.includes(tag.id)
                              return (
                                <Button
                                  key={tag.id}
                                  size="xs"
                                  variant={selected ? "solid" : "outline"}
                                  colorPalette={selected ? "blue" : "gray"}
                                  onClick={() => {
                                    const next = selected
                                      ? field.state.value.filter((id) => id !== tag.id)
                                      : [...field.state.value, tag.id]
                                    field.handleChange(next)
                                  }}
                                >
                                  {tag.name}
                                </Button>
                              )
                            })
                          }
                        </form.Field>
                      </HStack>
                    </Box>
                  )}

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
                      if (!segmentId) return
                      await deleteSegment.mutateAsync(segmentId)
                      onClose()
                    }}
                    loading={deleteSegment.isPending}
                  >
                    Delete Segment
                  </Button>
                </VStack>
              </form>
            ) : (
              <Text>Segment not found</Text>
            )}
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Positioner>
    </Drawer.Root>
  )
}
