import React, { useEffect, useContext } from "react"
import { Formik } from "formik"
import { Box } from "grommet"
import session from "sessionstorage"

import { SESSION_ID, SESSION_USERNAME } from "../constants"
import RoomContext from "../contexts/RoomContext"

const ChatInput = () => {
  const username = session.getItem(SESSION_USERNAME)
  const userId = session.getItem(SESSION_ID)
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
        onSubmit={(values, { setSubmitting }) => {
          // USE SOCKET CONTEXT TO EMIT MESSAGE HERE
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
          /* and other goodies */
        }) => (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              name="email"
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.email}
            />
            {errors.email && touched.email && errors.email}
            <input
              type="password"
              name="password"
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.password}
            />
            {errors.password && touched.password && errors.password}
            <button type="submit" disabled={isSubmitting}>
              Submit
            </button>
          </form>
        )}
      </Formik>
    </Box>
  )
}

export default ChatInput
