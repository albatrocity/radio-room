import React, { memo } from "react"
import { useMachine, useSelector } from "@xstate/react"
import { Box, Grid, GridItem, HStack } from "@chakra-ui/react"

import ChatMessages from "./ChatMessages"
import ChatInput from "./ChatInput"
import TypingIndicator from "./TypingIndicator"
import { chatMachine } from "../machines/chatMachine"
import { AuthContext } from "../machines/authMachine"
import { ChatMessage } from "../types/ChatMessage"
import { User } from "../types/User"
import useGlobalContext from "./useGlobalContext"
import PopoverPreferences from "./PopoverPreferences"

const currentUserSelector = (state: { context: AuthContext }): User =>
  state.context.currentUser
const isUnauthorizedSelector = (state) => state.matches("unauthorized")

interface ChatProps {
  modalActive: boolean
  onOpenReactionPicker: () => void
  onReactionClick: (emoji: any) => void
}

const Chat = ({
  modalActive,
  onOpenReactionPicker,
  onReactionClick,
}: ChatProps) => {
  const globalServices = useGlobalContext()
  const currentUser = useSelector(
    globalServices.authService,
    currentUserSelector,
  )
  const isUnauthorized = useSelector(
    globalServices.authService,
    isUnauthorizedSelector,
  )
  const [chatState, chatSend] = useMachine(chatMachine, {
    context: { currentUser },
  })
  const currentUserId = currentUser.userId

  return (
    <Grid
      className="chat"
      height="100%"
      flexGrow={1}
      flexShrink={1}
      templateAreas={[
        `"chat"
        "input"
    `,
      ]}
      gridTemplateRows={"1fr auto"}
      sx={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
      }}
    >
      <GridItem
        height="100%"
        width="100%"
        area={"chat"}
        overflowX="hidden"
        minHeight={0}
      >
        <Box h="100%" w="100%" className="messages-container">
          {(chatState.context?.messages || []).length > 0 && (
            <ChatMessages
              onOpenReactionPicker={onOpenReactionPicker}
              onReactionClick={onReactionClick}
              messages={chatState.context.messages}
              currentUserId={currentUserId}
            />
          )}
        </Box>
      </GridItem>
      <GridItem px={2} py={2} area={"input"} boxShadow="inner">
        <Box px={2} zIndex={1}>
          <TypingIndicator currentUserId={currentUserId} />
        </Box>
        <HStack zIndex={2} w="100%">
          <Box>
            <PopoverPreferences />
          </Box>
          <Box w="100%">
            <ChatInput
              modalActive={modalActive}
              onTypingStart={() => chatSend("START_TYPING")}
              onTypingStop={() => chatSend("STOP_TYPING")}
              onSend={(msg: ChatMessage) =>
                chatSend("SUBMIT_MESSAGE", { data: msg })
              }
            />
          </Box>
        </HStack>
      </GridItem>
    </Grid>
  )
}

export default memo(Chat)
