import type { ReactNode } from "react"
import { Dialog, CloseButton } from "@chakra-ui/react"

export const DialogRoot = Dialog.Root
export const DialogBackdrop = Dialog.Backdrop
export const DialogPositioner = Dialog.Positioner
export const DialogContent = Dialog.Content
export const DialogHeader = Dialog.Header
export const DialogTitle = Dialog.Title
export const DialogBody = Dialog.Body
export const DialogFooter = Dialog.Footer

/**
 * Full viewport dialog shell: backdrop + positioner + center placement + inside scroll.
 * Use with {@link DialogContent} as the direct child (Chakra v3 requires this structure).
 */
export function SchedulingDialogRoot({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      scrollBehavior="inside"
    >
      <Dialog.Backdrop />
      <Dialog.Positioner>{children}</Dialog.Positioner>
    </Dialog.Root>
  )
}

export function DialogCloseTrigger() {
  return (
    <Dialog.CloseTrigger asChild position="absolute" top={2} right={2}>
      <CloseButton size="sm" />
    </Dialog.CloseTrigger>
  )
}
