import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
} from "react"

import { Box, Button, Flex } from "@chakra-ui/react"
import { Chat } from "grommet-icons"
import { MentionsInput, Mention } from "react-mentions"
import { debounce } from "lodash"

import { GlobalStateContext } from "../contexts/global"
import { useSelector } from "@xstate/react"

const renderUserSuggestion = (
  suggestion,
  search,
  highlightedDisplay,
  index,
  focused,
) => {
  return (
    <div className={`user ${focused ? "focused" : ""}`}>
      {highlightedDisplay}
    </div>
  )
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
  }) => (
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

const ChatInput = ({ onTypingStart, onTypingStop, onSend, modalActive }) => {
  const globalServices = useContext(GlobalStateContext)

  const users = useSelector(globalServices.usersService, usersSelector)

  const inputRef = useRef(null)
  const [isTyping, setTyping] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [content, setContent] = useState("")

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

  const userSuggestions = users.map((x) => ({
    id: x.userId,
    display: x.username,
  }))

  const mentionStyle = {
    fontWeight: 700,
    height: "100%",
  }

  const inputStyle = {
    control: {
      backgroundColor: "#fff",
      // padding: theme.global.edgeSize.xsmall,
      // fontSize: theme.text.medium.size,
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
      border: "1px solid rgba(0,0,0,0.15)",
      borderRadius: "4px 0 0 4px",
      padding: "0.2em",
      fontSize: "1rem",
    },

    suggestions: {
      list: {
        backgroundColor: "white",
        border: "1px solid rgba(0,0,0,0.15)",
        fontSize: 14,
      },

      item: {
        padding: "5px 15px",
        borderBottom: "1px solid rgba(0,0,0,0.15)",

        "&focused": {
          // backgroundColor: theme.global.colors["accent-4"],
        },
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
    inputRef.current.focus()
  }

  return (
    <Box>
      <form onSubmit={handleSubmit}>
        <Flex direction="row" w="100%" justify="center">
          <Flex align="center" shrink={0} justify="center" mr={3}>
            <Chat size="16px" />
          </Flex>
          <Box
            grow={1}
            shrink={1}
            w="100%"
            sx={{
              "& > div": {
                height: "100%",
              },
            }}
          >
            <Input
              name="content"
              onChange={(value) => {
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
          <Button
            type="submit"
            variant="solid"
            colorScheme="blue"
            disabled={isSubmitting || !isValid}
            sx={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
          >
            Submit
          </Button>
        </Flex>
      </form>
    </Box>
  )
}

export default memo(ChatInput)
