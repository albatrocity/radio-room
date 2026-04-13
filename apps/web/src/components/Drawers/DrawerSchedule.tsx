import { Box } from "@chakra-ui/react"

import Drawer from "../Drawer"
import { useModalsSend, useIsModalOpen } from "../../hooks/useActors"
import RoomSchedulePanel from "../RoomSchedulePanel"

function DrawerSchedule() {
  const modalSend = useModalsSend()
  const isModalOpen = useIsModalOpen("schedule")
  const closeDrawer = () => modalSend({ type: "CLOSE" })

  return (
    <Drawer
      isOpen={isModalOpen}
      heading={`Schedule`}
      size={["sm", "lg"]}
      onClose={() => closeDrawer()}
    >
      <Box p="sm" overflow="auto" h="100%">
        <div>
          <RoomSchedulePanel />
        </div>
      </Box>
    </Drawer>
  )
}

export default DrawerSchedule
