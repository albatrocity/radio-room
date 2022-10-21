import React from "react"

import {
  Modal as ChakraModal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
} from "@chakra-ui/react"

interface Props {
  children: JSX.Element
  responsive?: boolean
  onClose?: () => void
  heading?: string
  canClose?: boolean
  contentPad?: {} | string[]
  isOpen?: boolean
}

const Modal = ({
  children,
  onClose = () => void 0,
  heading,
  canClose = true,
  contentPad,
  isOpen = false,
}: Props) => {
  return (
    <ChakraModal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />

      <ModalContent mx={2}>
        {heading && <ModalHeader>{heading}</ModalHeader>}

        {canClose && <ModalCloseButton />}
        <ModalBody p={contentPad}>{children}</ModalBody>
      </ModalContent>
    </ChakraModal>
  )
}

export default Modal
