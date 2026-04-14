import { useEffect, useRef } from "react"
import { Button } from "@chakra-ui/react"
import { useForm } from "@tanstack/react-form"
import type { ShowDTO } from "@repo/types"
import { toDatetimeLocalValue } from "../../lib/datetimeLocal"
import { useUpdateShow } from "../../hooks/useShows"
import { ShowDetailsFormFields, type ShowDetailsFormValues } from "./ShowDetailsFormFields"
import {
  SchedulingDialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
} from "../segments/DialogParts"

interface EditShowModalProps {
  open: boolean
  onClose: () => void
  show: ShowDTO
}

function valuesFromShow(show: ShowDTO): ShowDetailsFormValues {
  return {
    title: show.title,
    description: show.description ?? "",
    startTime: toDatetimeLocalValue(show.startTime),
    endTime: show.endTime ? toDatetimeLocalValue(show.endTime) : "",
    tagIds: (show.tags ?? []).map((t) => t.id),
  }
}

export function EditShowModal({ open, onClose, show }: EditShowModalProps) {
  const updateShow = useUpdateShow()
  const wasOpen = useRef(false)

  const form = useForm({
    defaultValues: valuesFromShow(show),
    onSubmit: async ({ value }) => {
      await updateShow.mutateAsync({
        id: show.id,
        title: value.title,
        description: value.description || null,
        startTime: new Date(value.startTime).toISOString(),
        endTime: value.endTime ? new Date(value.endTime).toISOString() : null,
        tagIds: value.tagIds,
      })
      onClose()
    },
  })

  useEffect(() => {
    if (open) {
      if (!wasOpen.current) {
        form.reset(valuesFromShow(show))
      }
      wasOpen.current = true
    } else {
      wasOpen.current = false
    }
  }, [open, show])

  return (
    <SchedulingDialogRoot open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Show</DialogTitle>
          <DialogCloseTrigger />
        </DialogHeader>
        <DialogBody>
          <form
            id="edit-show-form"
            onSubmit={(e) => {
              e.preventDefault()
              form.handleSubmit()
            }}
          >
            <ShowDetailsFormFields form={form} />
          </form>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="edit-show-form"
            colorPalette="blue"
            loading={updateShow.isPending}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </SchedulingDialogRoot>
  )
}
