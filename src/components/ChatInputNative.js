import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
} from "react"

import { Formik, FastField } from "formik"
import { Box, Button, ThemeContext } from "grommet"
import { Chat } from "grommet-icons"
import { MentionsInput, Mention } from "react-mentions"
import { debounce } from "lodash"
import { useUsers } from "../contexts/useUsers"
import { useAuth } from "../contexts/useAuth"
import styled from "styled-components"

const InputContainer = styled(Box)`
  > div {
    height: 100%;
  }
`

const renderUserSuggestion = (
  suggestion,
  search,
  highlightedDisplay,
  index,
  focused
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
      rows={1}
      onKeyDown={e => {
        if (e.keyCode === 13 && !e.shiftKey) {
          handleSubmit(e)
        }
      }}
      onChange={e => {
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
  )
)

const ChatInput = ({ onTypingStart, onTypingStop, onSend, modalActive }) => {
  const [usersState] = useUsers()
  const [authState] = useAuth()
  const {
    context: { users },
  } = usersState
  const {
    context: {
      currentUser: { username, userId },
    },
  } = authState

  const theme = useContext(ThemeContext)
  const inputRef = useRef(null)
  const [isTyping, setTyping] = useState(false)
  const [isSubmitting, setSubmitting] = useState(false)
  const [content, setContent] = useState("")

  const handleTypingStop = useCallback(
    debounce(() => {
      setTyping(false)
    }, 2000),
    []
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

  const userSuggestions = users.map(x => ({
    id: x.userId,
    display: x.username,
  }))

  const mentionStyle = {
    backgroundColor: theme.global.colors["accent-4"],
    fontWeight: 700,
    height: "100%",
  }

  const inputStyle = {
    control: {
      backgroundColor: "#fff",
      padding: theme.global.edgeSize.xsmall,
      fontSize: theme.text.medium.size,
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
      lineHeight: "2em",
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
          backgroundColor: theme.global.colors["accent-4"],
        },
      },
    },
  }

  const handleSubmit = e => {
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
        <Box direction="row" fill="horizontal" justify="center">
          <Box
            align="center"
            flex={{ shrink: 0 }}
            justify="center"
            margin={{ right: "medium" }}
          >
            <Chat size="16px" />
          </Box>
          <InputContainer flex={{ grow: 1, shrink: 1 }}>
            <Input
              name="content"
              onChange={value => {
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
          </InputContainer>
          <Button
            label="Submit"
            type="submit"
            primary
            disabled={isSubmitting || !isValid}
            style={{ borderTopLeftRadius: 0, borderBottomLeftRadius: 0 }}
          />
        </Box>
      </form>
    </Box>
  )
}

export default memo(ChatInput)
