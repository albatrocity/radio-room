import React from "react"
import { Formik, Field } from "formik"
import { Button, Form } from "grommet"
import socket from "../lib/socket"

const AdminPanel = () => {
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
