import React from "react"
import { Formik } from "formik"
import { Button, Paragraph, Box, TextInput } from "grommet"

interface Props {
  onSubmit: (url: string) => void
}

const FormAdminArtwork = ({ onSubmit }: Props) => {
  return (
    <Formik
      initialValues={{ url: "" }}
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values, { setSubmitting, resetForm }) => {
        resetForm()
        setSubmitting(false)
        onSubmit(values.url)
      }}
    >
      {({ values, handleChange, handleBlur, handleSubmit }) => (
        <form onSubmit={handleSubmit}>
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
        </form>
      )}
    </Formik>
  )
}

export default FormAdminArtwork
