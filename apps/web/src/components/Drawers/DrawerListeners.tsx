import React from "react"
import { Box } from "@chakra-ui/react"

import UserList from "../UserList"
import Drawer from "../Drawer"
import {
  useListeners,
  useModalsSend,
  useIsModalOpen,
  useCurrentRoomHasAudio,
} from "../../hooks/useActors"

function DrawerListeners() {
  const listeners = useListeners()
  const modalSend = useModalsSend()
  const hasAudio = useCurrentRoomHasAudio()
  const isModalViewingListeners = useIsModalOpen("listeners")
  const hideListeners = () => modalSend({ type: "CLOSE" })
  const handleEditUser = () => modalSend({ type: "EDIT_USERNAME" })

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
            showStatus={hasAudio}
            onEditUser={handleEditUser}
          />
        </div>
      </Box>
    </Drawer>
  )
}

export default DrawerListeners
