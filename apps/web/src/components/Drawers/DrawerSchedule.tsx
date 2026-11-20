import { Box } from "@chakra-ui/react"

import Drawer from "../Drawer"
import { useModalsSend, useIsModalOpen } from "../../hooks/useActors"
import { useIsBelowSm } from "../../hooks/useIntegratedPanelPresentation"
import RoomSchedulePanel from "../RoomSchedulePanel"
import VoicemailDeck from "../VoicemailDeck"

function DrawerSchedule() {
  const modalSend = useModalsSend()
  const isModalOpen = useIsModalOpen("schedule")
  const isSheet = useIsBelowSm()
  const closeDrawer = () => modalSend({ type: "CLOSE" })

  return (
    <Drawer
      isOpen={isModalOpen}
      heading={`Schedule`}
      placement={isSheet ? "bottom" : "end"}
      size={isSheet ? "lg" : ["sm", "lg"]}
      onClose={() => closeDrawer()}
    >
      <Box p="sm" overflow="auto" h="100%">
        <div>
          <RoomSchedulePanel />
          <VoicemailDeck />
        </div>
      </Box>
    </Drawer>
  )
}

export default DrawerSchedule
