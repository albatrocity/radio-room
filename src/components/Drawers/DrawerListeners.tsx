import React from "react"
import { Box } from "@chakra-ui/react"

import UserList from "../UserList"
import Drawer from "../Drawer"
import { useListeners } from "../../state/usersStore"
import { useModalsStore } from "../../state/modalsState"

function DrawerListeners() {
  const listeners = useListeners()
  const { send } = useModalsStore()
  const isModalViewingListeners = useModalsStore((s) =>
    s.state.matches("listeners"),
  )
  const hideListeners = () => send("CLOSE")
  const handleEditSettings = () => send("EDIT_SETTINGS")
  const handleEditUser = () => send("EDIT_USERNAME")

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
