import React, { ReactNode } from "react"

import {
  DialogRoot,
  DialogBackdrop,
  DialogPositioner,
  DialogContent,
  DialogHeader,
  DialogBody,
  DialogFooter,
  DialogCloseTrigger,
  CloseButton,
} from "@chakra-ui/react"

interface Props {
  children: JSX.Element
  onClose?: () => void
  heading?: string | ReactNode
  canClose?: boolean
  open?: boolean
  footer?: JSX.Element | null
  showFooter?: boolean
  // Legacy prop support
  isOpen?: boolean
}

const Modal = ({
  children,
  onClose = () => void 0,
  heading,
  canClose = true,
  open,
  isOpen,
  footer = null,
  showFooter = true,
}: Props) => {
  // Support both legacy isOpen and new open prop
  const isDialogOpen = open ?? isOpen ?? false

  return (
    <DialogRoot open={isDialogOpen} onOpenChange={(e) => !e.open && onClose()} placement="center">
      <DialogBackdrop />
      <DialogPositioner>
        <DialogContent mx={2} bg="appBg">
          <DialogHeader>{heading}</DialogHeader>

          {canClose && (
            <DialogCloseTrigger asChild position="absolute" top="2" right="2">
              <CloseButton size="sm" />
            </DialogCloseTrigger>
          )}
          <DialogBody>{children}</DialogBody>
          {showFooter && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </DialogPositioner>
    </DialogRoot>
  )
}

export default Modal
