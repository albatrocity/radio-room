import React from "react"
import { Box, Stack, Flex, IconButton, Icon, Show } from "@chakra-ui/react"
import { FiHelpCircle } from "react-icons/fi"
import Listeners from "./Listeners"
import useGlobalContext from "./useGlobalContext"
import AdminPanel from "./AdminPanel"

import { useAuthStore } from "../state/authStore"

const Sidebar = () => {
  const globalServices = useGlobalContext()
  const isUnauthorized = useAuthStore((s) => s.state.matches("unauthorized"))
  const isAdmin = useAuthStore((s) => s.state.context.isAdmin)

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
        <Flex h="100%" w="100%" direction="column">
          <Listeners
            onEditSettings={() =>
              globalServices.roomService.send("ADMIN_EDIT_SETTINGS")
            }
            onViewListeners={(view) =>
              view
                ? globalServices.roomService.send("VIEW_LISTENERS")
                : globalServices.roomService.send("CLOSE_VIEWING")
            }
            onEditUser={() => globalServices.roomService.send("EDIT_USERNAME")}
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
                onClick={() => globalServices.roomService.send("VIEW_HELP")}
              />
            </Flex>
          )}
        </Show>
        {isAdmin && <AdminPanel />}
      </Stack>
    </Box>
  )
}

export default Sidebar
