import React from "react"
import {
  Box,
  Stack,
  Flex,
  IconButton,
  Icon,
  Show,
  useColorModeValue,
} from "@chakra-ui/react"
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
  const adminButtonColorScheme = useColorModeValue("whiteAlpha", undefined)

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
        align="center"
        style={{
          filter: isUnauthorized ? "blur(0.5rem)" : "none",
        }}
      >
        <Banner />
        <Flex h="100%" w="100%" direction="column">
          <Listeners
            onViewListeners={(view) =>
              view ? modalSend("VIEW_LISTENERS") : modalSend("CLOSE")
            }
            onEditUser={() => modalSend("EDIT_USERNAME")}
          />
        </Flex>
        <Show above="sm">
          {!isAdmin && (
            <Flex p={3} align="center" grow={1} shrink={0}>
              <IconButton
                size="sm"
                aria-label="Help"
                variant="ghost"
                icon={<Icon as={FiHelpCircle} />}
                onClick={() => modalSend("VIEW_HELP")}
              />
            </Flex>
          )}
        </Show>
        {isAdmin && (
          <Show above="sm">
            <AdminControls
              p={3}
              borderTopWidth={1}
              borderTopColor="secondaryBorder"
              background="actionBg"
              width="100%"
              buttonColorScheme={adminButtonColorScheme}
            />
          </Show>
        )}
      </Stack>
    </Box>
  )
}

export default Sidebar
