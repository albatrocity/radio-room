import { Formik } from "formik"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"
import {
  Checkbox,
  Field,
  DialogBody,
  DialogFooter,
  VStack,
} from "@chakra-ui/react"
import { useSettingsStore } from "../../../state/settingsStore"
import FormActions from "./FormActions"
import { useModalsSend } from "../../../hooks/useActors"

export default function SpotifyFeatures() {
  const { state } = useSettingsStore()
  const modalSend = useModalsSend()
  const { send } = useAdminStore()

  return (
    <Formik
      initialValues={{
        enableSpotifyLogin: state.context.enableSpotifyLogin,
      }}
      enableReinitialize
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values) => {
        send({ type: "SET_SETTINGS", data: values } as any)
      }}
    >
      {({
        values,
        handleChange,
        handleBlur,
        handleSubmit,
        setTouched,
        initialValues,
        dirty,
      }) => (
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <VStack gap={6}>
              <Field.Root>
                <Checkbox.Root
                  checked={values.enableSpotifyLogin}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "enableSpotifyLogin",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.enableSpotifyLogin) {
                      setTouched({ enableSpotifyLogin: true })
                    } else {
                      setTouched({ enableSpotifyLogin: false })
                    }
                  }}
                  name="enableSpotifyLogin"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Enable Guest Spotify Login</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  When enabled, users will be able to link their Spotify
                  account, allowing them to see search results relevant to their
                  account and create their own playlists from the listening
                  history.
                </Field.HelperText>
              </Field.Root>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <FormActions
              onCancel={() => modalSend("CLOSE")}
              onSubmit={handleSubmit}
              dirty={dirty}
            />
          </DialogFooter>
        </form>
      )}
    </Formik>
  )
}
