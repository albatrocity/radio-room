import React, { useRef } from "react"
import {
  Button,
  AlertDialog,
  AlertDialogOverlay,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogBody,
  AlertDialogFooter,
  HStack,
} from "@chakra-ui/react"

type Props = {
  onConfirm: () => void
  onClose: () => void
  body: JSX.Element
  isDangerous?: boolean
  confirmLabel?: string
  cancelLabel?: string
  isOpen?: boolean
}

function ConfirmationDialog({
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  onClose,
  onConfirm,
  isDangerous = false,
  isOpen = false,
}: Props) {
  const cancelRef = useRef(null)
  return (
    <AlertDialog
      leastDestructiveRef={cancelRef}
      isOpen={isOpen}
      onClose={onClose}
    >
      <AlertDialogOverlay>
        <AlertDialogContent>
          <AlertDialogHeader fontSize="lg" fontWeight="bold">
            Delete Customer
          </AlertDialogHeader>

          <AlertDialogBody>{body}</AlertDialogBody>

          <AlertDialogFooter>
            <HStack spacing={2}>
              <Button ref={cancelRef} variant="ghost" onClick={onClose}>
                {cancelLabel}
              </Button>
              <Button
                onClick={() => {
                  onConfirm()
                  onClose()
                }}
                colorScheme={isDangerous ? "red" : undefined}
              >
                {confirmLabel}
              </Button>
            </HStack>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialogOverlay>
    </AlertDialog>
  )
}

export default ConfirmationDialog
