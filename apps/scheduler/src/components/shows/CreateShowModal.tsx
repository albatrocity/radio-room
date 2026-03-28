import { Box, Button, Fieldset, Input, Textarea } from "@chakra-ui/react"
import { useForm } from "@tanstack/react-form"
import { useCreateShow } from "../../hooks/useShows"
import {
  DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
} from "../segments/DialogParts"

interface CreateShowModalProps {
  open: boolean
  onClose: () => void
}

export function CreateShowModal({ open, onClose }: CreateShowModalProps) {
  const createShow = useCreateShow()

  const form = useForm({
    defaultValues: {
      title: "",
      description: "",
      startTime: "",
      endTime: "",
    },
    onSubmit: async ({ value }) => {
      await createShow.mutateAsync({
        title: value.title,
        description: value.description || null,
        startTime: new Date(value.startTime).toISOString(),
        endTime: value.endTime ? new Date(value.endTime).toISOString() : null,
      })
      onClose()
    },
  })

  return (
    <DialogRoot open={open} onOpenChange={(e) => !e.open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Show</DialogTitle>
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
                            placeholder="Show title"
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
                            placeholder="What is this show about?"
                            rows={3}
                          />
                        </label>
                      </Box>
                    )}
                  </form.Field>
                </Box>
                <Box mb={4}>
                  <form.Field name="startTime">
                    {(field) => (
                      <Box>
                        <label>
                          <Box mb={1} fontSize="sm" fontWeight="medium">
                            Start Time *
                          </Box>
                          <Input
                            type="datetime-local"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        </label>
                      </Box>
                    )}
                  </form.Field>
                </Box>
                <Box mb={4}>
                  <form.Field name="endTime">
                    {(field) => (
                      <Box>
                        <label>
                          <Box mb={1} fontSize="sm" fontWeight="medium">
                            End Time
                          </Box>
                          <Input
                            type="datetime-local"
                            value={field.state.value}
                            onChange={(e) => field.handleChange(e.target.value)}
                          />
                        </label>
                      </Box>
                    )}
                  </form.Field>
                </Box>
              </Fieldset.Content>
            </Fieldset.Root>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" colorPalette="blue" loading={createShow.isPending}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </DialogRoot>
  )
}
