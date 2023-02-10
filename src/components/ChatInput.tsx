import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
  ReactNode,
  MutableRefObject,
  ReactPortal,
} from "react"

import {
  Box,
  IconButton,
  Flex,
  HStack,
  Icon,
  Spacer,
  useToken,
} from "@chakra-ui/react"
import { motion } from "framer-motion"
import { FiArrowUpCircle } from "react-icons/fi"
import { MentionsInput, Mention } from "react-mentions"
import { debounce } from "lodash"

import { GlobalStateContext } from "../contexts/global"
import PopoverPreferences from "./PopoverPreferences"
import { useSelector } from "@xstate/react"
import { User } from "../types/User"

const renderUserSuggestion = (
  suggestion,
  search,
  highlightedDisplay,
  index,
  focused,
) => {
  return (
    <Box
      backgroundColor={focused ? "actionBg" : "transparent"}
      className={`user ${focused ? "focused" : ""}`}
      px={2}
    >
      {highlightedDisplay}
    </Box>
  )
}

interface InputProps {
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
    ...props
  }: InputProps) => (
    <MentionsInput
      name="content"
      allowSuggestionsAboveCursor={true}
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

const currentUserSelector = (state) => state.context.currentUser
const usersSelector = (state) => state.context.users

interface Props {
  onSettings: () => void
  onTypingStart: () => void
  onTypingStop: () => void
  onSend: (value: string) => void
  modalActive: boolean
}

const ChatInput = ({
  onTypingStart,
  onTypingStop,
  onSend,
  modalActive,
}: Props) => {
  const globalServices = useContext(GlobalStateContext)

  const currentUser = useSelector(
    globalServices.usersService,
    currentUserSelector,
  )
  const users = useSelector(globalServices.usersService, usersSelector)

  const inputRef = useRef<ReactPortal>()
  const [isTyping, setTyping] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [content, setContent] = useState("")
  const [borderColor] = useToken("colors", ["secondaryBorder"])
  const [space1] = useToken("space", [1.5])

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

  const userSuggestions = users
    .filter(({ userId }) => userId !== currentUser.userId)
    .map((x) => ({
      id: x.userId,
      display: x.username,
    }))

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
    },

    suggestions: {
      list: {
        backgroundColor: "white",
        border: `1px solid ${borderColor}`,
        fontSize: 14,
      },

      item: {
        borderBottom: `1px solid ${borderColor}`,
      },
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
    <HStack overflowX="clip">
      <PopoverPreferences />

      <Flex grow={1}>
        <form onSubmit={handleSubmit} style={{ width: "100%" }}>
          <Flex direction="row" w="100%" grow={1} justify="center">
            <Box
              w="100%"
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
              />
            </Box>
            <Spacer />
            <motion.div
              layout
              animate={{
                width: isValid ? "auto" : 0,
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
      </Flex>
    </HStack>
  )
}

export default memo(ChatInput)
