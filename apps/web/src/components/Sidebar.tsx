import { useCallback, memo } from "react"
import { Box, Stack, Flex, IconButton, Icon } from "@chakra-ui/react"
import { FiHelpCircle } from "react-icons/fi"
import Listeners from "./Listeners"
import AdminControls from "./AdminControls"
import Banner from "./Banner"

import { useIsAdmin, useAuthState, useModalsSend } from "../hooks/useActors"

const Sidebar = () => {
  const modalSend = useModalsSend()
  const authState = useAuthState()
  const isUnauthorized = authState === "unauthorized"
  const isAdmin = useIsAdmin()

  // Memoize callbacks
  const handleViewListeners = useCallback(
    (view: boolean) =>
      view ? modalSend({ type: "VIEW_LISTENERS" }) : modalSend({ type: "CLOSE" }),
    [modalSend],
  )

  const handleEditUser = useCallback(() => modalSend({ type: "EDIT_USERNAME" }), [modalSend])

  const handleViewHelp = useCallback(() => modalSend({ type: "VIEW_HELP" }), [modalSend])

  return (
    <Box
      w={["100%", "20vw"]}
      minW={"250px"}
      h="100%"
      className="sidebar"
      background="secondaryBg"
      layerStyle="themeTransition"
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
              layerStyle="themeTransition"
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
