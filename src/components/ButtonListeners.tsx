import React from "react"
import { Button, ButtonProps, Icon } from "@chakra-ui/react"
import { FiUsers } from "react-icons/fi"
import useGlobalContext from "./useGlobalContext"
import { useSelector } from "@xstate/react"

const listenersSelector = (state) => state.context.listeners

const ButtonListeners = (props: ButtonProps) => {
  const globalServices = useGlobalContext()
  const listeners = useSelector(globalServices.usersService, listenersSelector)
  const onShowListeners = () =>
    globalServices.roomService.send("VIEW_LISTENERS")
  return (
    <Button
      onClick={onShowListeners}
      aria-label="Listeners"
      leftIcon={<Icon as={FiUsers} />}
      background="transparent"
      size="sm"
      {...props}
    >
      {listeners.length}
    </Button>
  )
}

export default ButtonListeners
