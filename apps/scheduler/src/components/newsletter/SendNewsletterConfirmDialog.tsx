import { Button, Text } from "@chakra-ui/react"
import {
  SchedulingDialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
} from "../segments/DialogParts"

type Props = {
  open: boolean
  onClose: () => void
  subject: string
  activeSubscriberCount?: number
  isSending: boolean
  onConfirm: () => void | Promise<void>
}

export function SendNewsletterConfirmDialog({
  open,
  onClose,
  subject,
  activeSubscriberCount,
  isSending,
  onConfirm,
}: Props) {
  const subjectLabel = subject.trim() || "(no subject)"

  return (
    <SchedulingDialogRoot open={open} onClose={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send newsletter?</DialogTitle>
          <DialogCloseTrigger />
        </DialogHeader>
        <DialogBody>
          <Text mb={3}>
            This will email all active subscribers immediately. This cannot be undone.
          </Text>
          <Text fontWeight="medium" mb={1}>
            Subject
          </Text>
          <Text mb={3}>{subjectLabel}</Text>
          {activeSubscriberCount !== undefined ? (
            <Text color="fg.muted" fontSize="sm">
              {activeSubscriberCount} active subscriber{activeSubscriberCount === 1 ? "" : "s"} will
              receive this issue.
            </Text>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button colorPalette="blue" onClick={() => void onConfirm()} loading={isSending}>
            Send now
          </Button>
        </DialogFooter>
      </DialogContent>
    </SchedulingDialogRoot>
  )
}
