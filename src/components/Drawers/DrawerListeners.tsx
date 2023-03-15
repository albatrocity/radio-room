import React, { useCallback } from "react"
import { Box } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"

import UserList from "../UserList"
import Drawer from "../Drawer"
import useGlobalContext from "../useGlobalContext"

const listenersSelector = (state) => state.context.listeners
const isModalViewingListenersSelector = (state) =>
  state.matches("connected.participating.modalViewing.listeners")

function DrawerListeners() {
  const globalServices = useGlobalContext()
  const listeners = useSelector(globalServices.usersService, listenersSelector)
  const isModalViewingListeners = useSelector(
    globalServices.roomService,
    isModalViewingListenersSelector,
  )
  const hideListeners = useCallback(
    () => globalServices.roomService.send("CLOSE_VIEWING"),
    [globalServices.roomService],
  )

  const handleEditSettings = useCallback(
    () => globalServices.roomService.send("ADMIN_EDIT_SETTINGS"),
    [globalServices.roomService],
  )

  const handleEditUser = useCallback(() => {
    console.log("edit")
    return globalServices.roomService.send("EDIT_USERNAME")
  }, [globalServices.roomService])

  return (
    <Drawer
      isOpen={isModalViewingListeners}
      isFullHeight
      heading={`Listeners (${listeners.length})`}
      size={["sm", "lg"]}
      onClose={() => hideListeners()}
    >
      <Box p="sm" overflow="auto" h="100%">
        <div>
          <UserList
            showHeading={false}
            onEditSettings={handleEditSettings}
            onEditUser={handleEditUser}
          />
        </div>
      </Box>
    </Drawer>
  )
}

export default DrawerListeners
