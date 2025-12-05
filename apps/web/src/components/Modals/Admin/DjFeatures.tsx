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
import FormActions from "./FormActions"
import { useModalsSend, useSettings } from "../../../hooks/useActors"

function DjFeatures() {
  const settings = useSettings()
  const modalSend = useModalsSend()
  const { send } = useAdminStore()

  return (
    <Formik
      initialValues={{
        deputizeOnJoin: settings.deputizeOnJoin,
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
                  checked={values.deputizeOnJoin}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "deputizeOnJoin",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.deputizeOnJoin) {
                      setTouched({ deputizeOnJoin: true })
                    } else {
                      setTouched({ deputizeOnJoin: false })
                    }
                  }}
                  name="deputizeOnJoin"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Auto-deputize users</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  When enabled, users will be automatically deputized as DJs
                  when they join. You can still revoke DJ access as normal.
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

export default DjFeatures
