import { Formik } from "formik"
import React from "react"
import { Checkbox, Field, DialogBody, DialogFooter, VStack } from "@chakra-ui/react"
import FormActions from "./FormActions"
import { useModalsSend, useSettings, useAdminSend, useCurrentRoom } from "../../../hooks/useActors"

function DjFeatures() {
  const settings = useSettings()
  const room = useCurrentRoom()
  const modalSend = useModalsSend()
  const send = useAdminSend()

  return (
    <Formik
      initialValues={{
        deputizeOnJoin: settings.deputizeOnJoin,
        // Queue display settings default to true
        showQueueCount: room?.showQueueCount !== false,
        showQueueTracks: room?.showQueueTracks !== false,
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
      {({ values, handleChange, handleBlur, handleSubmit, setTouched, initialValues, dirty }) => (
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
                  When enabled, users will be automatically deputized as DJs when they join. You can
                  still revoke DJ access as normal.
                </Field.HelperText>
              </Field.Root>

              <Field.Root>
                <Checkbox.Root
                  checked={values.showQueueCount}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "showQueueCount",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.showQueueCount) {
                      setTouched({ showQueueCount: true })
                    } else {
                      setTouched({ showQueueCount: false })
                    }
                  }}
                  name="showQueueCount"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Show queue count</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  Display the number of songs in the queue on the "Add to queue" button.
                </Field.HelperText>
              </Field.Root>

              <Field.Root>
                <Checkbox.Root
                  checked={values.showQueueTracks}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "showQueueTracks",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.showQueueTracks) {
                      setTouched({ showQueueTracks: true })
                    } else {
                      setTouched({ showQueueTracks: false })
                    }
                  }}
                  name="showQueueTracks"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Show queued tracks</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  Display the list of upcoming queued tracks in the playlist drawer.
                </Field.HelperText>
              </Field.Root>
            </VStack>
          </DialogBody>
          <DialogFooter>
            <FormActions
              onCancel={() => modalSend({ type: "CLOSE" })}
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
