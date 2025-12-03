import { useCallback, memo } from "react"
import { Box, Stack, Flex, IconButton, Icon } from "@chakra-ui/react"
import { FiHelpCircle } from "react-icons/fi"
import Listeners from "./Listeners"
import AdminControls from "./AdminControls"

import { useAuthStore, useIsAdmin } from "../state/authStore"
import { useModalsStore } from "../state/modalsState"
import Banner from "./Banner"

const Sidebar = () => {
  const { send: modalSend } = useModalsStore()
  const isUnauthorized = useAuthStore((s) => s.state.matches("unauthorized"))
  const isAdmin = useIsAdmin()

  // Memoize callbacks
  const handleViewListeners = useCallback(
    (view: boolean) => (view ? modalSend("VIEW_LISTENERS") : modalSend("CLOSE")),
    [modalSend],
  )

  const handleEditUser = useCallback(() => modalSend("EDIT_USERNAME"), [modalSend])

  const handleViewHelp = useCallback(() => modalSend("VIEW_HELP"), [modalSend])

  return (
    <Box
      w={["100%", "20vw"]}
      minW={"250px"}
      h="100%"
      background="secondaryBg"
      borderLeftWidth={1}
      borderLeftColor="secondaryBorder"
      borderLeftStyle="solid"
    >
      <Stack
        direction={["row", "column"]}
        w="100%"
        h="100%"
        style={{
          filter: isUnauthorized ? "blur(0.5rem)" : "none",
        }}
      >
        <Banner />
        <Flex h="100%" direction="column">
          <Listeners onViewListeners={handleViewListeners} onEditUser={handleEditUser} />
        </Flex>
        <Box hideBelow="sm">
          {!isAdmin && (
            <Flex p={3} align="center" grow={1} shrink={0} width="100%">
              <IconButton size="sm" aria-label="Help" variant="ghost" onClick={handleViewHelp}>
                <Icon as={FiHelpCircle} />
              </IconButton>
            </Flex>
          )}
        </Box>
        {isAdmin && (
          <Box hideBelow="sm">
            <AdminControls
              p={3}
              borderTopWidth={1}
              borderTopColor="secondaryBorder"
              background="actionBg"
              width="100%"
              buttonColorScheme="action"
            />
          </Box>
        )}
      </Stack>
    </Box>
  )
}

export default memo(Sidebar)
