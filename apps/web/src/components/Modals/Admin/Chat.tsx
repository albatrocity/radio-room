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

export default function Chat() {
  const { state } = useSettingsStore()
  const modalSend = useModalsSend()
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
                  checked={values.announceNowPlaying}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "announceNowPlaying",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.announceNowPlaying) {
                      setTouched({ announceNowPlaying: true })
                    } else {
                      setTouched({ announceNowPlaying: false })
                    }
                  }}
                  name="announceNowPlaying"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Announce Now Playing</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  If enabled, a system message will be sent to the chat when the
                  now playing track changes.
                </Field.HelperText>
              </Field.Root>
              <Field.Root>
                <Checkbox.Root
                  checked={values.announceUsernameChanges}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "announceUsernameChanges",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.announceUsernameChanges) {
                      setTouched({ announceUsernameChanges: true })
                    } else {
                      setTouched({ announceUsernameChanges: false })
                    }
                  }}
                  name="announceUsernameChanges"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Announce Username Changes</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  If enabled, a system message will be sent to the chat when
                  someone changes their username.
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
