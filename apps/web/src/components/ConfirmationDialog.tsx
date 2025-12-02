import React, { useRef } from "react"
import {
  Button,
  DialogRoot,
  DialogBackdrop,
  DialogPositioner,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  HStack,
} from "@chakra-ui/react"

type Props = {
  onConfirm: () => void
  onClose: () => void
  title?: string
  body: JSX.Element
  isDangerous?: boolean
  confirmLabel?: string
  cancelLabel?: string
  open?: boolean
  // Legacy prop support
  isOpen?: boolean
}

function ConfirmationDialog({
  title = "Are you sure?",
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onClose,
  onConfirm,
  isDangerous = false,
  open,
  isOpen,
}: Props) {
  const cancelRef = useRef(null)
  // Support both legacy isOpen and new open prop
  const isDialogOpen = open ?? isOpen ?? false

  return (
    <DialogRoot
      role="alertdialog"
      open={isDialogOpen}
      onOpenChange={(e) => !e.open && onClose()}
      initialFocusEl={() => cancelRef.current}
      placement="center"
    >
      <DialogBackdrop />
      <DialogPositioner>
        <DialogContent>
          <DialogHeader fontSize="lg" fontWeight="bold">
            {title}
          </DialogHeader>

          <DialogBody>{body}</DialogBody>

          <DialogFooter>
            <HStack gap={2}>
              <Button ref={cancelRef} variant="ghost" onClick={onClose}>
                {cancelLabel}
              </Button>
              <Button
                onClick={() => {
                  onConfirm()
                  onClose()
                }}
                colorPalette={isDangerous ? "red" : undefined}
              >
                {confirmLabel}
              </Button>
            </HStack>
          </DialogFooter>
        </DialogContent>
      </DialogPositioner>
    </DialogRoot>
  )
}

export default ConfirmationDialog
