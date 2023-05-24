import React, { memo, useEffect } from "react"
import { Box, Grid, GridItem, HStack } from "@chakra-ui/react"

import ChatInput from "./ChatInput"
import TypingIndicator from "./TypingIndicator"
import { ChatMessage } from "../types/ChatMessage"
import PopoverPreferences from "./PopoverPreferences"

import { useAuthStore, useCurrentUser } from "../state/authStore"
import { useChatStore } from "../state/chatStore"
import ChatWindow from "./ChatWindow"

const Chat = () => {
  const currentUser = useCurrentUser()
  const isUnauthorized = useAuthStore((s) => s.state.matches("unauthorized"))
  const { send: chatSend } = useChatStore()
  const messages = useChatStore((s) => s.state.context.messages)
  useEffect(() => {
    chatSend("SET_CURRENT_USER", { data: currentUser })
  }, [currentUser])
  const currentUserId = currentUser?.userId

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
          {messages.length > 0 && <ChatWindow />}
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
