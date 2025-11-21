import { Formik } from "formik"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"
import {
  Checkbox,
  FormControl,
  FormHelperText,
  ModalBody,
  ModalFooter,
  VStack,
} from "@chakra-ui/react"
import { settingsMachine } from "../../../machines/settingsMachine"
import { useMachine } from "@xstate/react"
import FormActions from "./FormActions"
import { useModalsStore } from "../../../state/modalsState"

export default function SpotifyFeatures() {
  const [state] = useMachine(settingsMachine)
  const { send: modalSend } = useModalsStore()
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
          <ModalBody>
            <VStack spacing={6}>
              <FormControl>
                <Checkbox
                  isChecked={values.enableSpotifyLogin}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.checked !== initialValues.enableSpotifyLogin) {
                      setTouched({ enableSpotifyLogin: true })
                    } else {
                      setTouched({ enableSpotifyLogin: false })
                    }
                  }}
                  onBlur={handleBlur}
                  value={values.enableSpotifyLogin ? 1 : 0}
                  name="enableSpotifyLogin"
                >
                  Enable Guest Spotify Login
                </Checkbox>
                <FormHelperText>
                  When enabled, users will be able to link their Spotify
                  account, allowing them to see search results relevant to their
                  account and create their own playlists from the listening
                  history.
                </FormHelperText>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <FormActions
              onCancel={() => modalSend("CLOSE")}
              onSubmit={handleSubmit}
              dirty={dirty}
            />
          </ModalFooter>
        </form>
      )}
    </Formik>
  )
}
