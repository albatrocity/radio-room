import React, { useCallback } from "react"
import { Box } from "@chakra-ui/react"

import UserList from "../UserList"
import Drawer from "../Drawer"
import useGlobalContext from "../useGlobalContext"
import { useListeners } from "../../state/usersStore"
import { useModalsStore } from "../../state/modalsState"

function DrawerListeners() {
  const globalServices = useGlobalContext()
  const listeners = useListeners()
  const { send } = useModalsStore()
  const isModalViewingListeners = useModalsStore((s) =>
    s.state.matches("listeners"),
  )
  const hideListeners = useCallback(
    () => send("CLOSE"),
    [globalServices.roomService],
  )

  const handleEditSettings = useCallback(
    () => globalServices.roomService.send("ADMIN_EDIT_SETTINGS"),
    [globalServices.roomService],
  )

  const handleEditUser = useCallback(() => {
    return send("EDIT_USERNAME")
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
