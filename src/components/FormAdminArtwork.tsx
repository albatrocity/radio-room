import React from "react"
import { Formik } from "formik"
import {
  Button,
  Input,
  HStack,
  FormControl,
  FormHelperText,
  FormLabel,
} from "@chakra-ui/react"

import Modal from "./Modal"
import { useCover } from "../state/audioStore"

interface Props {
  onSubmit: (url: string) => void
  onClose: () => void
  isOpen: boolean
}

const FormAdminArtwork = ({ onSubmit, onClose, isOpen }: Props) => {
  const url = useCover() || ""
  return (
    <Formik
      enableReinitialize
      initialValues={{ url }}
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
      {({ values, handleChange, handleBlur, handleSubmit }) => {
        return (
          <form onSubmit={handleSubmit}>
            <Modal
              isOpen={isOpen}
              onClose={onClose}
              heading="Set Cover Artwork"
              footer={
                <HStack spacing={2}>
                  <Button variant="outline" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" onClick={() => handleSubmit()}>
                    Submit
                  </Button>
                </HStack>
              }
            >
              <FormControl>
                <FormLabel>Image URL</FormLabel>
                <Input
                  onChange={handleChange}
                  onBlur={handleBlur}
                  value={values.url}
                  name="url"
                />
                <FormHelperText>
                  If you want to override the cover artwork for the stream,
                  enter an image URL here. To resume using artwork from Spotify,
                  clear the image URL.
                </FormHelperText>
              </FormControl>
            </Modal>
          </form>
        )
      }}
    </Formik>
  )
}

export default FormAdminArtwork
