import React from "react"
import { Box, Stack, Flex, Button, Heading, IconButton } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"
import { SettingsOption, List, HelpOption } from "grommet-icons"
import Listeners from "./Listeners"
import useGlobalContext from "./useGlobalContext"

type Props = {}

const isUnauthorizedSelector = (state) => state.matches("unauthorized")
const isAdminSelector = (state) => state.context.isAdmin
const isEditingSettingsSelector = (state) =>
  state.matches("connected.participating.editing.settings")
const isDjSelector = (state) => state.matches("djaying.isDj")
const isNotDjSelector = (state) => state.matches("djaying.notDj")

const Sidebar = (props: Props) => {
  const globalServices = useGlobalContext()

  const isUnauthorized = useSelector(
    globalServices.authService,
    isUnauthorizedSelector,
  )
  const isEditingSettings = useSelector(
    globalServices.roomService,
    isEditingSettingsSelector,
  )
  const isDj = useSelector(globalServices.roomService, isDjSelector)
  const isNotDj = useSelector(globalServices.roomService, isNotDjSelector)
  const isAdmin = useSelector(globalServices.authService, isAdminSelector)

  return (
    <Box w={["100%", "20vw"]} minW={"250px"} bg="light-1" h="100%">
      <Stack
        direction={["row", "column"]}
        w="100%"
        h="100%"
        p="sm"
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
        {!isAdmin && (
          <Flex p={3} align="center" grow={1} shrink={0}>
            <IconButton
              size="small"
              aria-label="Help"
              variant="outline"
              icon={<HelpOption size="medium" color="brand" />}
              onClick={() => globalServices.roomService.send("VIEW_HELP")}
            />
          </Flex>
        )}
      </Stack>
      {isAdmin && (
        <Flex p="medium" shrink={0}>
          <Heading as="h1" margin={{ bottom: "xsmall" }}>
            Admin
          </Heading>
          <Box gap="small">
            {isNotDj && (
              <Button
                onClick={() =>
                  globalServices.roomService.send("START_DJ_SESSION")
                }
                variant="solid"
              >
                I am the DJ
              </Button>
            )}
            {isDj && (
              <Button
                onClick={() =>
                  globalServices.roomService.send("END_DJ_SESSION")
                }
              >
                End DJ Session
              </Button>
            )}
            <Button
              onClick={() =>
                globalServices.roomService.send("ADMIN_EDIT_ARTWORK")
              }
            >
              Change Cover Art
            </Button>

            <Box
            // animation={
            //   isEditingSettings
            //     ? {
            //         type: "pulse",
            //         delay: 0,
            //         duration: 400,
            //         size: "medium",
            //       }
            //     : null
            // }
            >
              <Button
                variant={isEditingSettings ? "primary" : "outline"}
                leftIcon={<SettingsOption size="small" />}
                onClick={() =>
                  globalServices.roomService.send("ADMIN_EDIT_SETTINGS")
                }
              >
                Settings
              </Button>
            </Box>
            {isDj && (
              <Button
                variant="solid"
                leftIcon={<List size="small" />}
                onClick={() => {
                  const confirmation = window.confirm(
                    "Are you sure you want to clear the playlist? This cannot be undone.",
                  )
                  if (confirmation) {
                    globalServices.roomService.send("ADMIN_CLEAR_PLAYLIST")
                  }
                }}
              >
                Clear Playlist
              </Button>
            )}
          </Box>
        </Flex>
      )}
    </Box>
  )
}

export default Sidebar
