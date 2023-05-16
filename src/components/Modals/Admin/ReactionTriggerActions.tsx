import React from "react"
import { useMachine } from "@xstate/react"
import { FieldArray, Formik } from "formik"

import {
  FormControl,
  FormHelperText,
  Input,
  ModalBody,
  ModalFooter,
  VStack,
} from "@chakra-ui/react"
import FormActions from "./FormActions"

import { useAdminStore } from "../../../state/adminStore"
import { useModalsStore } from "../../../state/modalsState"
import { triggerEventsMachine } from "../../../machines/triggerEventsMachine"
import FieldTriggerAction from "../../Fields/Triggers/FieldTriggerAction"

type Props = {}

const ReactionTriggerActions = (props: Props) => {
  const [state] = useMachine(triggerEventsMachine)
  const { send: modalSend } = useModalsStore()
  const { send } = useAdminStore()
  const triggers = state.context.reactions
  const onCancel = () => modalSend("CLOSE")

  return (
    <Formik
      initialValues={{
        triggers,
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
      {({ values, handleChange, handleBlur, handleSubmit }) => (
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <VStack spacing={6}>
              <FormControl gap={2}>
                <FieldArray name="friends">
                  {(actions) => (
                    <VStack spacing={12}>
                      {values.triggers.map((trigger, index) => (
                        <FieldTriggerAction
                          key={index}
                          index={index}
                          value={trigger}
                          actions={actions}
                        />
                      ))}
                    </VStack>
                  )}
                </FieldArray>
                <FormHelperText></FormHelperText>
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

export default ReactionTriggerActions
