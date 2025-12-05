import React from "react"
import { Button, ButtonProps, Icon } from "@chakra-ui/react"
import { FiUsers } from "react-icons/fi"
import { useListeners, useModalsSend } from "../hooks/useActors"

const ButtonListeners = (props: ButtonProps) => {
  const modalSend = useModalsSend()
  const listeners = useListeners()
  const onShowListeners = () => modalSend({ type: "VIEW_LISTENERS" })
  return (
    <Button
      onClick={onShowListeners}
      aria-label="Listeners"
      background="transparent"
      size="sm"
      {...props}
    >
      <Icon boxSize={5} as={FiUsers} />
      {listeners.length}
    </Button>
  )
}

export default ButtonListeners
