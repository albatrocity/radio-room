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

function DjFeatures() {
  const [state] = useMachine(settingsMachine)
  const { send: modalSend } = useModalsStore()
  const { send } = useAdminStore()

  return (
    <Formik
      initialValues={{
        deputizeOnJoin: state.context.deputizeOnJoin,
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
                  isChecked={values.deputizeOnJoin}
                  onChange={(e) => {
                    handleChange(e)
                    if (e.target.checked !== initialValues.deputizeOnJoin) {
                      setTouched({ deputizeOnJoin: true })
                    } else {
                      setTouched({ deputizeOnJoin: false })
                    }
                  }}
                  onBlur={handleBlur}
                  value={values.deputizeOnJoin ? 1 : 0}
                  name="deputizeOnJoin"
                >
                  Auto-deputize users
                </Checkbox>
                <FormHelperText>
                  When enabled, users will be automatically deputized as DJs
                  when they join. You can still revoke DJ access as normal.
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

export default DjFeatures
