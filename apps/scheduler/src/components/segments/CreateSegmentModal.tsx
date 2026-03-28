import {
  Box,
  Button,
  Fieldset,
  HStack,
  Input,
  Textarea,
} from "@chakra-ui/react"
import { useForm } from "@tanstack/react-form"
import { useCreateSegment } from "../../hooks/useSegments"
import { useTags } from "../../hooks/useTags"
import type { SegmentStatus } from "@repo/types"
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
} from "./DialogParts"

interface CreateSegmentModalProps {
  open: boolean
  onClose: () => void
}

export function CreateSegmentModal({ open, onClose }: CreateSegmentModalProps) {
  const createSegment = useCreateSegment()
  const { data: tags } = useTags("segment")

  const form = useForm({
    defaultValues: {
      title: "",
      description: "",
      isRecurring: false,
      status: "draft" as SegmentStatus,
      tagIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      await createSegment.mutateAsync({
        title: value.title,
        description: value.description || null,
        isRecurring: value.isRecurring,
        status: value.status,
        tagIds: value.tagIds,
      })
      onClose()
    },
  })

  return (
    <DialogRoot open={open} onOpenChange={(e) => !e.open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Segment</DialogTitle>
          <DialogCloseTrigger />
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            form.handleSubmit()
          }}
        >
          <DialogBody>
            <Fieldset.Root>
              <Fieldset.Content>
                <Box mb={4}>
                  <form.Field name="title">
                    {(field) => (
                      <Box>
                        <label>
                          <Box mb={1} fontSize="sm" fontWeight="medium">
                            Title *
                          </Box>
                          <Input
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="Segment title"
                          />
                        </label>
                      </Box>
                    )}
                  </form.Field>
                </Box>
                <Box mb={4}>
                  <form.Field name="description">
                    {(field) => (
                      <Box>
                        <label>
                          <Box mb={1} fontSize="sm" fontWeight="medium">
                            Description
                          </Box>
                          <Textarea
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="What is this segment about?"
                            rows={3}
                          />
                        </label>
                      </Box>
                    )}
                  </form.Field>
                </Box>
                <Box mb={4}>
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
                </Box>
                {tags && tags.length > 0 && (
                  <Box mb={4}>
                    <Box mb={1} fontSize="sm" fontWeight="medium">
                      Tags
                    </Box>
                    <HStack gap={2} flexWrap="wrap">
                      <form.Field name="tagIds">
                        {(field) =>
                          tags.map((tag) => {
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
              </Fieldset.Content>
            </Fieldset.Root>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" colorPalette="blue" loading={createSegment.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
