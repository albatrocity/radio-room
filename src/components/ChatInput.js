import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  memo,
} from "react"
import { Formik, Field } from "formik"
import { Box, Button, TextInput, ThemeContext } from "grommet"
import { Chat } from "grommet-icons"
import { MentionsInput, Mention } from "react-mentions"
import { debounce } from "lodash"
import session from "sessionstorage"
import styled from "styled-components"

import { SESSION_ID, SESSION_USERNAME } from "../constants"
import SocketContext from "../contexts/SocketContext"

const InputContainer = styled(Box)`
  > div {
    height: 100%;
  }
`

const ChatInput = ({ users }) => {
  const username = session.getItem(SESSION_USERNAME)
  const userId = session.getItem(SESSION_ID)
  const { socket } = useContext(SocketContext)
  const theme = useContext(ThemeContext)
  const inputRef = useRef(null)
  const [isTyping, setTyping] = useState(false)

  const handleTypingStop = debounce(() => {
    setTyping(false)
  }, 2000)

  useEffect(() => {
    if (isTyping) {
      socket.emit("typing")
    } else {
      socket.emit("stop typing")
    }
  }, [isTyping])

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
    },

    input: {
      margin: 0,
    },

    "&singleLine": {
      control: {},

      highlighter: {
        padding: 0,
        border: "none",
        height: "100%",
      },

      input: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexGrow: 1,
        border: "2px inset",
      },
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

  const Input = ({ field, form, ...props }) => (
    <MentionsInput
      name="content"
      singleLine
      inputRef={inputRef}
      style={inputStyle}
      value={form.values.content}
      autoFocus
      onChange={e => {
        if (e.target.value && e.target.value !== "") {
          handleKeyInput()
        }
        form.setFieldValue(field.name, e.target.value)
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

  return (
    <Box>
      <Formik
        initialValues={{ content: "", username, userId }}
        validate={values => {
          const errors = {}
          if (!values.content) {
            errors.content = "Required"
          }
          return errors
        }}
        onSubmit={(values, { setSubmitting, resetForm }) => {
          socket.emit("new message", values.content)
          resetForm()
          setSubmitting(false)
          inputRef.current.focus()
        }}
      >
        {({
          values,
          errors,
          touched,
          handleChange,
          handleBlur,
          handleSubmit,
          isSubmitting,
          isValid,
        }) => (
          <form onSubmit={handleSubmit}>
            <Box direction="row" fill="horizontal" gap="small" justify="center">
              <Box align="center" justify="center">
                <Chat />
              </Box>
              <InputContainer flex={{ grow: 1, shrink: 1 }}>
                <Field component={Input} name="content" />
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
        )}
      </Formik>
    </Box>
  )
}

export default memo(ChatInput)
