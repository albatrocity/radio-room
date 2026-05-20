import { Box, ScrollArea } from "@chakra-ui/react"

import UserList from "../UserList"
import Drawer from "../Drawer"
import {
  useListeners,
  useModalsSend,
  useIsModalOpen,
  useCurrentRoomHasAudio,
} from "../../hooks/useActors"
import ScrollShadowViewport from "../ScrollShadowViewport"

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
      heading={`Listeners (${listeners.length})`}
      size={["sm", "lg"]}
      onClose={() => hideListeners()}
    >
      <ScrollArea.Root>
        <ScrollShadowViewport>
          <Box p="sm">
            <div>
              <UserList showHeading={false} showStatus={hasAudio} onEditUser={handleEditUser} />
            </div>
          </Box>
        </ScrollShadowViewport>
      </ScrollArea.Root>
    </Drawer>
  )
}

export default DrawerListeners
