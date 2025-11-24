import React, { ReactNode } from "react"

import {
  Modal as ChakraModal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
} from "@chakra-ui/react"

interface Props {
  children: JSX.Element
  onClose?: () => void
  heading?: string | ReactNode
  canClose?: boolean
  isOpen?: boolean
  footer?: JSX.Element | null
  showFooter?: boolean
}

const Modal = ({
  children,
  onClose = () => void 0,
  heading,
  canClose = true,
  isOpen = false,
  footer = null,
  showFooter = true,
}: Props) => {
  return (
    <ChakraModal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />

      <ModalContent mx={2}>
        <ModalHeader>{heading}</ModalHeader>

        {canClose && <ModalCloseButton />}
        <ModalBody>{children}</ModalBody>
        {showFooter && <ModalFooter>{footer}</ModalFooter>}
      </ModalContent>
    </ChakraModal>
  )
}

export default Modal
