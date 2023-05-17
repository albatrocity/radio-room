import { Formik } from "formik"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"
import {
  Checkbox,
  FormControl,
  FormHelperText,
  FormLabel,
  Input,
  ModalBody,
  ModalFooter,
  Textarea,
  VStack,
} from "@chakra-ui/react"
import { settingsMachine } from "../../../machines/settingsMachine"
import { useMachine } from "@xstate/react"
import FormActions from "./FormActions"
import { useModalsStore } from "../../../state/modalsState"

function Content() {
  const [state] = useMachine(settingsMachine)
  const { send: modalSend } = useModalsStore()
  const { send } = useAdminStore()

  return (
    <Formik
      initialValues={{
        fetchMeta: state.context.fetchMeta,
        extraInfo: state.context.extraInfo || "",
        artwork: state.context.artwork || "",
      }}
      enableReinitialize
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values, { setSubmitting }) => {
        send("SET_SETTINGS", { data: values })
        setSubmitting(false)
      }}
    >
      {({
        values,
        handleChange,
        handleBlur,
        handleSubmit,
        setTouched,
        initialValues,
      }) => (
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <VStack spacing={6}>
              <FormControl>
                <FormLabel>Banner Content</FormLabel>
                <Textarea
                  name="extraInfo"
                  value={values.extraInfo}
                  onBlur={handleBlur}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.value !== initialValues.extraInfo) {
                      setTouched({ extraInfo: true })
                    } else {
                      setTouched({ extraInfo: false })
                    }
                  }}
                />
                <FormHelperText>Formatted with Markdown</FormHelperText>
              </FormControl>

              <FormControl>
                <FormLabel>Artwork</FormLabel>
                <Input
                  name="artwork"
                  value={values.artwork}
                  placeholder="Image URL"
                  onBlur={handleBlur}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.value !== initialValues.artwork) {
                      setTouched({ artwork: true })
                    } else {
                      setTouched({ artwork: false })
                    }
                  }}
                />
                <FormHelperText>
                  URL of an image to display in the Now Playing area. Overrides
                  any album artwork from Spotify. Leave blank to use album
                  artwork.
                </FormHelperText>
              </FormControl>

              <FormControl>
                <Checkbox
                  isChecked={values.fetchMeta}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.checked !== initialValues.fetchMeta) {
                      setTouched({ fetchMeta: true })
                    } else {
                      setTouched({ fetchMeta: false })
                    }
                  }}
                  onBlur={handleBlur}
                  value={values.fetchMeta}
                  name="fetchMeta"
                >
                  Fetch album metadata
                </Checkbox>
                <FormHelperText>
                  Album Metadata (album artwork, release date, info URL) is
                  automatically fetched from Spotify based on the
                  Title/Artist/Album that your broadcast software sends to the
                  Shoustcast server. If you're getting inaccurate data or want
                  to manually set the cover artwork, disable this option.
                </FormHelperText>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <FormActions
              onCancel={() => modalSend("CLOSE")}
              onSubmit={handleSubmit}
            />
          </ModalFooter>
        </form>
      )}
    </Formik>
  )
}

export default Content
