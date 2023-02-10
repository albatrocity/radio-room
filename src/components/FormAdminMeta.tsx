import React from "react"
import { Formik } from "formik"
import { Button, Text, Box, Input } from "@chakra-ui/react"

interface Props {
  onSubmit: (metaString: string) => void
}

const FormAdminMeta = ({ onSubmit }: Props) => {
  return (
    <Formik
      initialValues={{ track: "", artist: "", release: "" }}
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values, { setSubmitting, resetForm }) => {
        onSubmit(`${values.track}|${values.artist}|${values.release}`)
        resetForm()
        setSubmitting(false)
      }}
    >
      {({ values, handleChange, handleBlur, handleSubmit }) => (
        <form onSubmit={handleSubmit}>
          <Box gap={1}>
            <Text as="p">
              Use this form to submit station meta and trigger a MusicBrainz
              lookup for release info/cover art.{" "}
            </Text>
            <Input
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.track}
              name="track"
              placeholder="Track Title"
            />
            <Input
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.artist}
              name="artist"
              placeholder="Artist Name"
            />
            <Input
              onChange={handleChange}
              onBlur={handleBlur}
              value={values.release}
              name="release"
              placeholder="Album/Release Name"
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

export default FormAdminMeta
