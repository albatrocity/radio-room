import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
  ReactNode,
  MutableRefObject,
  ReactPortal,
  useMemo,
} from "react"

import {
  Box,
  IconButton,
  Flex,
  Icon,
  Spacer,
  Text,
  useToken,
  InputElementProps,
} from "@chakra-ui/react"
import { motion } from "framer-motion"
import { FiArrowUpCircle } from "react-icons/fi"
import { MentionsInput, Mention } from "react-mentions"
import { debounce } from "lodash"

import { User } from "../types/User"
import MentionSuggestionsContainer from "./MentionSuggestionsContainer"
import { ChatMessage } from "../types/ChatMessage"
import { useCurrentUser, useIsAuthenticated } from "../state/authStore"
import { useUsers } from "../state/usersStore"
import { useModalsStore } from "../state/modalsState"

const renderUserSuggestion = (
  suggestion,
  search,
  highlightedDisplay,
  index,
  focused,
) => {
  return (
    <Box
      backgroundColor={focused ? "actionBgLite" : "transparent"}
      className={`user ${focused ? "focused" : ""}`}
      px={2}
      py={1}
    >
      <Text size="xs">{highlightedDisplay}</Text>
    </Box>
  )
}

type InputProps = {
  inputRef: MutableRefObject<ReactPortal>
  inputStyle: any
  handleKeyInput: () => void
  userSuggestions: User[]
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
} & InputElementProps

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
      inputRef={inputRef}
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

  const inputRef = useRef<ReactPortal>()
  const [isTyping, setTyping] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [content, setContent] = useState("")
  const [borderColor] = useToken("colors", ["secondaryBorder"])
  const [inputBackground] = useToken("colors", ["secondaryBg"])
  const [space1] = useToken("space", [1.5])
  const modalActive = useModalsStore((s) => !s.state.matches("closed"))

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
      padding: space1,
      fontSize: "1rem",
      background: inputBackground,
    },

    suggestions: {
      backgroundColor: "transparent",
      boxShadow: `0 2px 2px rgba(0, 0, 0, 0.2)`,
    },
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (content !== "") {
      onSend(content)
      setContent("")
    }
    setSubmitting(false)
  }

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%" }}>
      <Flex direction="row" w="100%" grow={1} justify="center" overflowX="clip">
        <Box
          w="100%"
          opacity={isAuthenticated ? 1 : 0}
          sx={{
            "& > div": {
              height: "100%",
            },
          }}
        >
          <Input
            name="content"
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
        <motion.div
          layout
          animate={{
            width: isValid ? "auto" : 5,
            opacity: isValid ? 1 : 0,
          }}
        >
          <IconButton
            aria-label="Send Message"
            type="submit"
            variant="solid"
            isDisabled={isSubmitting || !isValid}
            sx={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
            icon={<Icon as={FiArrowUpCircle} />}
          >
            Submit
          </IconButton>
        </motion.div>
      </Flex>
    </form>
  )
}

export default memo(ChatInput)
