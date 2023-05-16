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
} from "@chakra-ui/react"
import React from "react"
import { useModalsStore } from "../../../state/modalsState"
import { settingsMachine } from "../../../machines/settingsMachine"
import ActiveIndicator from "../../ActiveIndicator"

function Overview() {
  const { send } = useModalsStore()
  const [settingsState] = useMachine(settingsMachine)
  const hasPassword = !!settingsState.context.password

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
                rightIcon={<ChevronRightIcon />}
                variant="settingsCategory"
                borderBottomRadius="none"
                onClick={() => send("EDIT_CONTENT")}
              >
                Content
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
          <VStack align="left" spacing={2}>
            <Heading as="h4" size="sm" textAlign="left">
              Triggers & Actions
            </Heading>
            <VStack w="100%" align="left" spacing="1px">
              <Button
                rightIcon={<ChevronRightIcon />}
                variant="settingsCategory"
                borderBottomRadius="none"
                onClick={() => send("EDIT_REACTION_TRIGGERS")}
              >
                Reaction-triggered actions
              </Button>
              <Button
                rightIcon={<ChevronRightIcon />}
                variant="settingsCategory"
                borderTopRadius="none"
                onClick={() => send("EDIT_MESSAGE_TRIGGERS")}
              >
                Message-triggered actions
              </Button>
            </VStack>
          </VStack>
        </VStack>
      </ModalBody>
      <ModalFooter />
    </Box>
  )
}

export default Overview
