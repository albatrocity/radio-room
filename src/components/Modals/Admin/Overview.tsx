import { ChevronRightIcon } from "@chakra-ui/icons"
import { useMachine } from "@xstate/react"
import {
  Badge,
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
import { triggerEventsMachine } from "../../../machines/triggerEventsMachine"
import DestructiveActions from "./DestructiveActions"
import ButtonAppAuthSpotify from "../../ButtonAppAuthSpotify"

function Overview() {
  const { send } = useModalsStore()
  const [settingsState] = useMachine(settingsMachine)
  const [triggersState] = useMachine(triggerEventsMachine)
  const hasPassword = !!settingsState.context.password
  const spotifyLoginEnabled = settingsState.context.enableSpotifyLogin
  const hasSettings =
    !!settingsState.context.extraInfo || !!settingsState.context.artwork
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
                    {hasSettings && <ActiveIndicator />}
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
          {/* <VStack align="left" spacing={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Triggers & Actions
            </Heading>
            <VStack w="100%" align="left" spacing="1px">
              <Button
                borderBottomRadius="none"
                rightIcon={
                  <HStack>
                    {triggersState.context.reactions?.length && (
                      <Badge colorScheme="primary">
                        {triggersState.context.reactions?.length}
                      </Badge>
                    )}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                onClick={() => send("EDIT_REACTION_TRIGGERS")}
              >
                Reaction-triggered actions
              </Button>
              <Button
                borderTopRadius="none"
                rightIcon={
                  <HStack>
                    {triggersState.context.messages?.length && (
                      <Badge colorScheme="primary">
                        {triggersState.context.messages?.length}
                      </Badge>
                    )}
                    <ChevronRightIcon />
                  </HStack>
                }
                variant="settingsCategory"
                onClick={() => send("EDIT_MESSAGE_TRIGGERS")}
              >
                Message-triggered actions
              </Button>
            </VStack>
          </VStack> */}

          <VStack w="100%" align="left" spacing={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Authentication
            </Heading>
            <ButtonAppAuthSpotify />
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
