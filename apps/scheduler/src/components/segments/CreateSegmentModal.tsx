import { Box, Button, Fieldset, HStack, Input, Textarea } from "@chakra-ui/react"
import { useForm } from "@tanstack/react-form"
import { useCreateSegment } from "../../hooks/useSegments"
import type { SegmentStatus } from "@repo/types"
import { TagCombobox } from "../tags/TagCombobox"
import {
  SchedulingDialogRoot,
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

  const form = useForm({
    defaultValues: {
      title: "",
      description: "",
      durationMinutes: "",
      isRecurring: false,
      status: "draft" as SegmentStatus,
      tagIds: [] as string[],
    },
    onSubmit: async ({ value }) => {
      const raw = value.durationMinutes.trim()
      let duration: number | null = null
      if (raw !== "") {
        const n = parseInt(raw, 10)
        if (Number.isFinite(n) && n >= 0) duration = n
      }
      await createSegment.mutateAsync({
        title: value.title,
        description: value.description || null,
        duration,
        isRecurring: value.isRecurring,
        status: value.status,
        tagIds: value.tagIds,
      })
      onClose()
    },
  })

  return (
    <SchedulingDialogRoot open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Segment</DialogTitle>
          <DialogCloseTrigger />
        </DialogHeader>
        <DialogBody>
          <form
            id="create-segment-form"
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
          >
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
                  <form.Field name="durationMinutes">
                    {(field) => (
                      <Box>
                        <label>
                          <Box mb={1} fontSize="sm" fontWeight="medium">
                            Approx. duration (minutes)
                          </Box>
                          <Input
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                            placeholder="Optional"
                            inputMode="numeric"
                            type="number"
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
                <Box mb={4}>
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
              </Fieldset.Content>
            </Fieldset.Root>
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            colorPalette="blue"
            form="create-segment-form"
            loading={createSegment.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </SchedulingDialogRoot>
  )
}
