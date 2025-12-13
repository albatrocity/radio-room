import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
  ReactNode,
  ReactPortal,
  useMemo,
  RefObject,
} from "react"

import { Box, IconButton, Flex, Icon, Spacer, Text } from "@chakra-ui/react"
import { FiArrowUpCircle } from "react-icons/fi"
import { MentionsInput, Mention } from "react-mentions"
import { debounce } from "lodash"

import MentionSuggestionsContainer from "./MentionSuggestionsContainer"
import { ChatMessage } from "../types/ChatMessage"
import { useCurrentUser, useIsAuthenticated, useUsers, useIsAnyModalOpen } from "../hooks/useActors"

const renderUserSuggestion = (
  suggestion: any,
  search: any,
  highlightedDisplay: any,
  index: any,
  focused: any,
) => {
  return (
    <Box
      backgroundColor={focused ? "actionBgLite" : "transparent"}
      className={`user ${focused ? "focused" : ""}`}
      px={2}
      py={1}
    >
      <Text fontSize="xs">{highlightedDisplay}</Text>
    </Box>
  )
}

type InputProps = {
  inputRef: RefObject<ReactPortal | undefined>
  inputStyle: any
  handleKeyInput: () => void
  userSuggestions: { id: string; display: string }[]
  mentionStyle: any
  renderUserSuggestion: (
    suggestion: any,
    search: any,
    highlightedDisplay: any,
    index: any,
    focused: any,
  ) => ReactNode
  autoFocus: boolean
  value: string
  onChange: (value: string) => void
  handleSubmit: (e: React.SyntheticEvent) => void
  isDisabled: boolean
}

const Input = memo(
  ({
    inputRef,
    inputStyle,
    handleKeyInput,
    userSuggestions,
    mentionStyle,
    renderUserSuggestion,
    autoFocus,
    value,
    onChange,
    handleSubmit,
    isDisabled = false,
  }: InputProps) => (
    <MentionsInput
      name="content"
      allowSuggestionsAboveCursor={true}
      forceSuggestionsAboveCursor={true}
      customSuggestionsContainer={MentionSuggestionsContainer}
      inputRef={inputRef as any}
      style={inputStyle}
      value={value}
      autoFocus={autoFocus}
      autoComplete="off"
      onKeyDown={(e) => {
        if (e.keyCode === 13 && !e.shiftKey) {
          handleSubmit(e)
        }
      }}
      onChange={(e) => {
        if (e.target.value && e.target.value !== "") {
          handleKeyInput()
        }
        onChange(e.target.value)
      }}
      placeholder={isDisabled ? "" : "Say something..."}
      disabled={isDisabled}
    >
      <Mention
        trigger="@"
        appendSpaceOnAdd={true}
        data={userSuggestions}
        style={mentionStyle}
        renderSuggestion={renderUserSuggestion}
      />
    </MentionsInput>
  ),
)
interface Props {
  onTypingStart: () => void
  onTypingStop: () => void
  onSend: (value: ChatMessage) => void
}

const ChatInput = ({ onTypingStart, onTypingStop, onSend }: Props) => {
  const currentUser = useCurrentUser()
  const users = useUsers()
  const isAuthenticated = useIsAuthenticated()
  const modalActive = useIsAnyModalOpen()

  const inputRef = useRef<ReactPortal>(null)
  const [isTyping, setTyping] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [content, setContent] = useState("")

  // Use CSS variables for colors
  const borderColor = "var(--chakra-colors-secondary-border, #ccc)"
  const inputBackground = "var(--chakra-colors-secondary-bg, #f5f5f5)"

  const handleTypingStop = useCallback(
    debounce(() => {
      setTyping(false)
    }, 2000),
    [],
  )

  useEffect(() => {
    if (isTyping) {
      onTypingStart()
    } else {
      onTypingStop()
    }
  }, [isTyping])

  const isValid = content !== ""

  const handleKeyInput = useCallback(() => {
    setTyping(true)
    handleTypingStop()
  }, [])

  const userSuggestions = useMemo(
    () =>
      users
        .filter(({ userId }) => userId !== currentUser.userId)
        .map((x) => ({
          id: x.userId,
          display: x.username,
        })),
    [currentUser, users],
  )

  const mentionStyle = {
    fontWeight: 700,
    height: "100%",
  }

  const inputStyle = {
    control: {
      backgroundColor: "transparent",
      fontWeight: "normal",
    },

    highlighter: {
      overflow: "hidden",
      padding: 0,
      border: "none",
      height: "100%",
    },

    input: {
      margin: 0,
      width: "100%",
      border: `1px solid ${borderColor}`,
      borderRadius: "4px",
      padding: "6px",
      fontSize: "1rem",
      background: inputBackground,
    },

    suggestions: {
      backgroundColor: "transparent",
      boxShadow: `0 2px 2px rgba(0, 0, 0, 0.2)`,
    },
  }

  const handleSubmit = (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (content !== "") {
      onSend(content as unknown as ChatMessage)
      setContent("")
    }
    setSubmitting(false)
  }

  if (!currentUser) {
    return null
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <Flex direction="row" w="100%" grow={1} justify="center" overflowX="clip">
        <Box
          w="100%"
          opacity={isAuthenticated ? 1 : 0}
          css={{
            "& > div": {
              height: "100%",
            },
          }}
          layerStyle="themeTransition"
        >
          <Input
            onChange={(value: string) => {
              setContent(value)
            }}
            handleSubmit={handleSubmit}
            value={content}
            inputRef={inputRef}
            inputStyle={inputStyle}
            handleKeyInput={handleKeyInput}
            userSuggestions={userSuggestions}
            mentionStyle={mentionStyle}
            renderUserSuggestion={renderUserSuggestion}
            autoFocus={modalActive}
            isDisabled={!isAuthenticated}
          />
        </Box>
        <Spacer />
        <Box
          transition="width 0.2s, opacity 0.2s"
          width={isValid ? "auto" : "5px"}
          opacity={isValid ? 1 : 0}
          overflow="hidden"
        >
          <IconButton
            aria-label="Send Message"
            type="submit"
            variant="ghost"
            disabled={isSubmitting || !isValid}
            colorPalette="action"
            css={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
          >
            <Icon as={FiArrowUpCircle} />
          </IconButton>
        </Box>
      </Flex>
    </form>
  )
}

export default memo(ChatInput)
