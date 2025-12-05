import React from "react"
import { Button, ButtonProps, Icon } from "@chakra-ui/react"
import { FiUsers } from "react-icons/fi"
import { useListeners } from "../state/usersStore"
import { useModalsStore } from "../state/modalsState"

const ButtonListeners = (props: ButtonProps) => {
  const { send } = useModalsStore()
  const listeners = useListeners()
  const onShowListeners = () => send("VIEW_LISTENERS")
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
