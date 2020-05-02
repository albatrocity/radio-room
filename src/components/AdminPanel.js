import React, { useContext } from "react"
import { Formik, Field } from "formik"
import { Box, Button, Form } from "grommet"

import SocketContext from "../contexts/SocketContext"

const AdminPanel = () => {
  const { socket } = useContext(SocketContext)
  return (
    <Formik
      initialValues={{ title: "" }}
      validate={values => {
        const errors = {}
        if (!values.title) {
          errors.title = "Required"
        }
        return errors
      }}
      onSubmit={(values, { setSubmitting, resetForm }) => {
        socket.emit("fix meta", values.title)
        resetForm()
        setSubmitting(false)
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
        <Form onSubmit={handleSubmit}>
          <Field name="title" />
          <Button type="submit" label="Submit" primary />
        </Form>
      )}
    </Formik>
  )
}

export default AdminPanel
