import { Dialog, CloseButton } from "@chakra-ui/react"

export const DialogRoot = Dialog.Root
export const DialogContent = Dialog.Content
export const DialogHeader = Dialog.Header
export const DialogTitle = Dialog.Title
export const DialogBody = Dialog.Body
export const DialogFooter = Dialog.Footer
export function DialogCloseTrigger() {
  return (
    <Dialog.CloseTrigger asChild position="absolute" top={2} right={2}>
      <CloseButton size="sm" />
    </Dialog.CloseTrigger>
  )
}
