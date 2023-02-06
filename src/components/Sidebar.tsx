import React from "react"
import {
  Box,
  Stack,
  Flex,
  Button,
  Heading,
  IconButton,
  Icon,
  Show,
  Wrap,
  WrapItem,
} from "@chakra-ui/react"
import { useSelector } from "@xstate/react"
import { GrSettingsOption, GrList, GrHelpOption } from "react-icons/gr"
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
        <Show above="sm">
          {!isAdmin && (
            <Flex p={3} align="center" grow={1} shrink={0}>
              <IconButton
                size="small"
                aria-label="Help"
                variant="outline"
                icon={<Icon as={GrHelpOption} boxSize={2} />}
                onClick={() => globalServices.roomService.send("VIEW_HELP")}
              />
            </Flex>
          )}
        </Show>
        {isAdmin && (
          <Show above="sm">
            <Stack direction="column" p={3} borderTopWidth={1}>
              <Heading as="h3" size="md" margin={{ bottom: "xsmall" }}>
                Admin
              </Heading>

              <Wrap>
                {isNotDj && (
                  <WrapItem>
                    <Button
                      onClick={() =>
                        globalServices.roomService.send("START_DJ_SESSION")
                      }
                      variant="solid"
                    >
                      I am the DJ
                    </Button>
                  </WrapItem>
                )}
                <WrapItem>
                  <Button
                    size="xs"
                    onClick={() =>
                      globalServices.roomService.send("ADMIN_EDIT_ARTWORK")
                    }
                  >
                    Change Cover Art
                  </Button>
                </WrapItem>

                <WrapItem>
                  <Button
                    size="xs"
                    variant={isEditingSettings ? "primary" : "outline"}
                    leftIcon={<Icon as={GrSettingsOption} />}
                    onClick={() =>
                      globalServices.roomService.send("ADMIN_EDIT_SETTINGS")
                    }
                  >
                    Settings
                  </Button>
                </WrapItem>
                {isDj && (
                  <>
                    <WrapItem>
                      <Button
                        size="xs"
                        variant="solid"
                        colorScheme="red"
                        leftIcon={<Icon as={GrList} />}
                        onClick={() => {
                          const confirmation = window.confirm(
                            "Are you sure you want to clear the playlist? This cannot be undone.",
                          )
                          if (confirmation) {
                            globalServices.roomService.send(
                              "ADMIN_CLEAR_PLAYLIST",
                            )
                          }
                        }}
                      >
                        Clear Playlist
                      </Button>
                    </WrapItem>
                    <WrapItem>
                      <Button
                        size="xs"
                        onClick={() =>
                          globalServices.roomService.send("END_DJ_SESSION")
                        }
                      >
                        End DJ Session
                      </Button>
                    </WrapItem>
                  </>
                )}
              </Wrap>
            </Stack>
          </Show>
        )}
      </Stack>
    </Box>
  )
}

export default Sidebar
