import React from "react"
import { Formik } from "formik"
import { Button, Form, Paragraph, Box, TextInput } from "grommet"
import socket from "../lib/socket"

const FormAdminMeta = ({ onSubmit }) => {
  return (
    <Formik
      initialValues={{ track: "", artist: "", release: "" }}
      validate={values => {
        const errors = {}
        return errors
      }}
      onSubmit={(values, { setSubmitting, resetForm }) => {
        onSubmit(`${values.track}|${values.artist}|${values.release}`)
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
          <Box gap="small">
            <Paragraph>
              Use this form to submit station meta and trigger a MusicBrainz
              lookup for release info/cover art.{" "}
            </Paragraph>
            <TextInput
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.track}
              name="track"
              placeholder="Track Title"
            />
            <TextInput
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.artist}
              name="artist"
              placeholder="Artist Name"
            />
            <TextInput
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.release}
              name="release"
              placeholder="Album/Release Name"
            />
            <Button type="submit" label="Submit" primary />
          </Box>
        </Form>
      )}
    </Formik>
  )
}

export default FormAdminMeta
