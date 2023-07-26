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

export default function Chat() {
  const [state] = useMachine(settingsMachine)
  const { send: modalSend } = useModalsStore()
  const { send } = useAdminStore()

  return (
    <Formik
      initialValues={{
        announceNowPlaying: state.context.announceNowPlaying,
        announceUsernameChanges: state.context.announceUsernameChanges,
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
                <Checkbox
                  isChecked={values.announceNowPlaying}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.checked !== initialValues.announceNowPlaying) {
                      setTouched({ announceNowPlaying: true })
                    } else {
                      setTouched({ announceNowPlaying: false })
                    }
                  }}
                  onBlur={handleBlur}
                  value={values.announceNowPlaying ? 1 : 0}
                  name="announceNowPlaying"
                >
                  Announce Now Playing
                </Checkbox>
                <FormHelperText>
                  If enabled, a system message will be sent to the chat when the
                  now playing track changes.
                </FormHelperText>
              </FormControl>
              <FormControl>
                <Checkbox
                  isChecked={values.announceUsernameChanges}
                  onChange={(e) => {
                    handleChange(e)
                    if (
                      e.target.checked !== initialValues.announceUsernameChanges
                    ) {
                      setTouched({ announceUsernameChanges: true })
                    } else {
                      setTouched({ announceUsernameChanges: false })
                    }
                  }}
                  onBlur={handleBlur}
                  value={values.announceUsernameChanges ? 1 : 0}
                  name="announceUsernameChanges"
                >
                  Announce Username Changes
                </Checkbox>
                <FormHelperText>
                  If enabled, a system message will be sent to the chat when
                  someone changes their username.
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
