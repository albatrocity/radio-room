import React from "react"

import { useModalsStore } from "../../../state/modalsState"
import {
  Collapse,
  HStack,
  Heading,
  IconButton,
  Box,
  Modal,
  ModalCloseButton,
  ModalContent,
  ModalHeader,
  ModalOverlay,
} from "@chakra-ui/react"
import { ArrowBackIcon } from "@chakra-ui/icons"
import Overview from "./Overview"
import Content from "./Content"
import Password from "./Password"
import ReactionTriggerActions from "./ReactionTriggerActions"
import MessageTriggerActions from "./MessageTriggerActions"
import DjFeatures from "./DjFeatures"
import ButtonAuthSpotify from "../../ButtonAuthSpotify"

const Header = ({
  showBack,
  onBack,
}: {
  showBack: boolean
  onBack: () => void
}) => {
  return (
    <HStack>
      {showBack && (
        <IconButton
          onClick={onBack}
          icon={<ArrowBackIcon />}
          aria-label="back"
          variant="ghost"
        >
          Back
        </IconButton>
      )}
      <Heading size="lg">Settings</Heading>
    </HStack>
  )
}

function ModalAdminSettings() {
  const { state, send } = useModalsStore()
  const isEditingSettings = useModalsStore((s) => s.state.matches("settings"))

  const hideEditForm = () => send("CLOSE")
  const onBack = () => {
    send("BACK")
  }

  const isTriggersView =
    state.matches("settings.reaction_triggers") ||
    state.matches("settings.message_triggers")

  return (
    <Modal
      isOpen={isEditingSettings}
      onClose={hideEditForm}
      size={isTriggersView ? "2xl" : "md"}
    >
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>
          <Header
            showBack={!state.matches("settings.overview")}
            onBack={onBack}
          />
        </ModalHeader>
        <ModalCloseButton />

        <Collapse in={state.matches("settings.overview")}>
          <Overview />
        </Collapse>
        <Collapse in={state.matches("settings.dj")}>
          <DjFeatures />
        </Collapse>
        <Collapse in={state.matches("settings.content")}>
          <Content />
        </Collapse>
        <Collapse in={state.matches("settings.password")}>
          <Password />
        </Collapse>
        <Collapse in={state.matches("settings.reaction_triggers")}>
          <ReactionTriggerActions />
        </Collapse>
        <Collapse in={state.matches("settings.message_triggers")}>
          <MessageTriggerActions />
        </Collapse>

        {state.matches("settings.overview") && (
          <Box px={6} py={4}>
            <ButtonAuthSpotify userId="app" />
          </Box>
        )}
      </ModalContent>
    </Modal>
  )
}

export default ModalAdminSettings
