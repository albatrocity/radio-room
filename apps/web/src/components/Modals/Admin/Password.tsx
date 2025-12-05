import { Formik } from "formik"
import React from "react"
import { useAdminStore } from "../../../state/adminStore"
import {
  Field,
  DialogBody,
  DialogFooter,
  VStack,
} from "@chakra-ui/react"
import { useSettingsStore } from "../../../state/settingsStore"
import FormActions from "./FormActions"
import { useModalsSend } from "../../../hooks/useActors"
import FieldText from "../../Fields/FieldText"

function Password() {
  const { state } = useSettingsStore()
  const modalSend = useModalsSend()
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
      onSubmit={(values) => {
        send({ type: "SET_SETTINGS", data: values } as any)
      }}
    >
      {({ handleBlur, handleSubmit, dirty }) => (
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <VStack gap={6}>
              <Field.Root gap={2}>
                <FieldText
                  onBlur={handleBlur}
                  name="password"
                  placeholder="Password"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                />
                <Field.HelperText>
                  Setting a password will require guests to enter it before
                  joining the room. Clearing this password will open the
                  experience up to anyone with the room URL.
                </Field.HelperText>
              </Field.Root>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <FormActions onCancel={onCancel} onSubmit={handleSubmit} dirty={dirty} />
          </DialogFooter>
        </form>
      )}
    </Formik>
  )
}

export default Password
