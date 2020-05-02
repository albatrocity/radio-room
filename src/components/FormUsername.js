import React, { useContext } from "react"
import { Formik } from "formik"
import { Box, Button, TextInput, Heading } from "grommet"
import session from "sessionstorage"

import { SESSION_ID, SESSION_USERNAME } from "../constants"
import RoomContext from "../contexts/RoomContext"

const FormUsername = () => {
  const username = session.getItem(SESSION_USERNAME)
  const userId = session.getItem(SESSION_ID)
  const { state, dispatch } = useContext(RoomContext)

  return (
    <Box pad="small" gap="small" width="medium">
      <Formik
        initialValues={{ username: "", userId }}
        validate={values => {
          const errors = {}
          if (!values.username) {
            errors.username = "Required"
          }
          return errors
        }}
        onSubmit={(values, { setSubmitting, resetForm }) => {
          setSubmitting(false)
          dispatch({ type: "CHANGE_USERNAME", payload: values.username })
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
            <Heading level={3}>What's your name?</Heading>
            <Box direction="row" fill="horizontal">
              <TextInput
                onChange={handleChange}
                onBlur={handleBlur}
                resize={false}
                value={values.username}
                placeholder={username}
                name="username"
                flex="grow"
                autoFocus={true}
                style={{ borderTopRightRadius: 0, borderBottomRightRadius: 0 }}
              />
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
      <Button
        label={state.editingUser ? "Cancel" : "Remain Anonymous"}
        onClick={() => dispatch({ type: "CLOSE_USERNAME_FORM" })}
      />
    </Box>
  )
}

export default FormUsername
