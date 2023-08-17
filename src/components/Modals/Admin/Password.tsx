import { Formik } from "formik"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"
import {
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
import FieldText from "../../Fields/FieldText"

function Password() {
  const [state] = useMachine(settingsMachine)
  const { send: modalSend } = useModalsStore()
  const { send } = useAdminStore()

  const onCancel = () => modalSend("CLOSE")

  return (
    <Formik
      initialValues={{
        password: state.context.password || "",
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
      {({ handleBlur, handleSubmit }) => (
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <VStack spacing={6}>
              <FormControl gap={2}>
                <FieldText
                  onBlur={handleBlur}
                  name="password"
                  placeholder="Password"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                <FormHelperText>
                  Setting a password will require guests to enter it before
                  joining the room. Clearing this password will open the
                  experience up to anyone with the room URL.
                </FormHelperText>
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <FormActions onCancel={onCancel} onSubmit={handleSubmit} />
          </ModalFooter>
        </form>
      )}
    </Formik>
  )
}

export default Password
