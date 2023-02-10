import React from "react"
import { Formik } from "formik"
import { Button, Text, Box, Input } from "@chakra-ui/react"

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
            <Text as="p">
              If MusicBrainz didn't give you good cover art, you can provide an
              image URL to use for the currently playing track.
            </Text>
            <Input
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.url}
              name="url"
              placeholder="image url"
            />
            <Button type="submit" variant="solid">
              Submit
            </Button>
          </Box>
        </form>
      )}
    </Formik>
  )
}

export default FormAdminArtwork
