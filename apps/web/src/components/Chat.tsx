import { memo, useCallback, useRef } from "react"
import { Box, Grid, GridItem, HStack, Stack } from "@chakra-ui/react"

import ChatInput, { MessagePayload } from "./ChatInput"
import TypingIndicator from "./TypingIndicator"
import PopoverPreferences from "./PopoverPreferences"
import ChatWindow from "./ChatWindow"

import { useCurrentUser, useChatMessages, useAuthState, useChatSend } from "../hooks/useActors"

const Chat = () => {
  const currentUser = useCurrentUser()
  const authState = useAuthState()
  const isUnauthorized = authState === "unauthorized"
  const chatSend = useChatSend()
  const messages = useChatMessages()
  const imagePreviewRef = useRef<HTMLDivElement>(null)

  const currentUserId = currentUser?.userId

  // Memoize callbacks to prevent ChatInput re-renders
  const handleTypingStart = useCallback(() => chatSend({ type: "START_TYPING" }), [chatSend])
  const handleTypingStop = useCallback(() => chatSend({ type: "STOP_TYPING" }), [chatSend])
  const handleSend = useCallback(
    (msg: MessagePayload) => chatSend({ type: "SUBMIT_MESSAGE", data: msg }),
    [chatSend],
  )

  if (!currentUserId) {
    return null
  }

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
      css={{
        filter: isUnauthorized ? "blur(0.5rem)" : "none",
        overflowX: "visible",
      }}
    >
      <GridItem height="100%" width="100%" area={"chat"} overflowX="visible" minHeight={0}>
        <Box h="100%" w="100%" className="messages-container">
          {messages.length > 0 && <ChatWindow />}
        </Box>
      </GridItem>
      <GridItem px={2} py={2} area={"input"} boxShadow="inner">
        <Stack gap={2}>
          <Box px={2} zIndex={1}>
            <TypingIndicator currentUserId={currentUserId} />
          </Box>
          {/* Image previews will be portaled here from ChatInput */}
          <Box ref={imagePreviewRef} />
          <HStack zIndex={2} w="100%" gap={0} align="center">
            <PopoverPreferences />
            <ChatInput
              onTypingStart={handleTypingStart}
              onTypingStop={handleTypingStop}
              onSend={handleSend}
              imagePreviewContainer={imagePreviewRef}
            />
          </HStack>
        </Stack>
      </GridItem>
    </Grid>
  )
}

export default memo(Chat)
