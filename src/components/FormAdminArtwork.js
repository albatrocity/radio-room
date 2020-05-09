import React from "react"
import { Formik } from "formik"
import { Button, Form, Paragraph, Box, TextInput } from "grommet"
import socket from "../lib/socket"

const FormAdminArtwork = ({ onSubmit }) => {
  return (
    <Formik
      initialValues={{ url: "" }}
      validate={values => {
        const errors = {}
        return errors
      }}
      onSubmit={(values, { setSubmitting, resetForm }) => {
        resetForm()
        setSubmitting(false)
        onSubmit(values.url)
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
          <Box gap="small">
            <Paragraph>
              If MusicBrainz didn't give you good cover art, you can provide an
              image URL to use for the currently playing track.
            </Paragraph>
            <TextInput
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.url}
              name="url"
              placeholder="image url"
            />
            <Button type="submit" label="Submit" primary />
          </Box>
        </Form>
      )}
    </Formik>
  )
}

export default FormAdminArtwork
