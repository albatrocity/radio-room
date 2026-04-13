import React from "react"
import { Button, ButtonProps, Icon } from "@chakra-ui/react"
import { LuUsers } from "react-icons/lu"
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
      <Icon boxSize={5} as={LuUsers} />
      {listeners.length}
    </Button>
  )
}

export default ButtonListeners
