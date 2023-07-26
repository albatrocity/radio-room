import { ChevronRightIcon } from "@chakra-ui/icons"
import { useMachine } from "@xstate/react"
import {
  Box,
  Button,
  HStack,
  Heading,
  ModalBody,
  ModalFooter,
  VStack,
  Divider,
} from "@chakra-ui/react"
import React from "react"
import { useModalsStore } from "../../../state/modalsState"
import { settingsMachine } from "../../../machines/settingsMachine"
import ActiveIndicator from "../../ActiveIndicator"
import DestructiveActions from "./DestructiveActions"
import ButtonRoomAuthSpotify from "../../ButtonRoomAuthSpotify"

function Overview() {
  const { send } = useModalsStore()
  const [settingsState] = useMachine(settingsMachine)
  const hasPassword = !!settingsState.context.password
  const spotifyLoginEnabled = settingsState.context.enableSpotifyLogin
  const hasSettings =
    !!settingsState.context.extraInfo ||
    !!settingsState.context.artwork ||
    !!settingsState.context.radioUrl
  const hasChatSettings =
    settingsState.context.announceNowPlaying ??
    settingsState.context.announceUsernameChanges
  const hasDjSettings = settingsState.context.deputizeOnJoin
  return (
    <Box>
      <ModalBody>
        <VStack align="left" spacing={6}>
          <VStack align="left" spacing={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Content & Auth
            </Heading>
            <VStack w="100%" align="left" spacing="1px">
              <Button
                rightIcon={
                  <HStack>
                    {hasSettings && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderBottomRadius="none"
                onClick={() => send("EDIT_CONTENT")}
              >
                Content
              </Button>
              <Button
                rightIcon={
                  <HStack>
                    {hasChatSettings && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderRadius="none"
                onClick={() => send("EDIT_CHAT")}
              >
                Chat
              </Button>
              <Button
                rightIcon={
                  <HStack>
                    {hasDjSettings && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderRadius="none"
                onClick={() => send("EDIT_DJ")}
              >
                DJ Features
              </Button>
              <Button
                rightIcon={
                  <HStack>
                    {spotifyLoginEnabled && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderRadius="none"
                onClick={() => send("EDIT_SPOTIFY")}
              >
                Spotify Features
              </Button>
              <Button
                rightIcon={
                  <HStack>
                    {hasPassword && <ActiveIndicator />}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                borderTopRadius="none"
                onClick={() => send("EDIT_PASSWORD")}
              >
                Password Protection
              </Button>
            </VStack>
          </VStack>

          <VStack w="100%" align="left" spacing={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Authentication
            </Heading>
            <ButtonRoomAuthSpotify />
          </VStack>
        </VStack>
        <Divider my={6} />
        <VStack w="100%" align="left" spacing={2}>
          <Heading as="h4" size="sm" textAlign="left" color="red">
            Danger Zone
          </Heading>
          <DestructiveActions />
        </VStack>
      </ModalBody>
      <ModalFooter />
    </Box>
  )
}

export default Overview
