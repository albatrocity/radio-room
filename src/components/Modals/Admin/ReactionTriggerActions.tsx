import React from "react"
import { useMachine } from "@xstate/react"
import { FieldArray, Formik } from "formik"
import mergician from "mergician"

import {
  Button,
  ButtonGroup,
  FormControl,
  FormHelperText,
  ModalBody,
  ModalFooter,
  VStack,
} from "@chakra-ui/react"
import FormActions from "./FormActions"

import { useModalsStore } from "../../../state/modalsState"
import { triggerEventsMachine } from "../../../machines/triggerEventsMachine"
import { AddIcon } from "@chakra-ui/icons"
import FieldTriggerAction from "../../Fields/Triggers/FieldTriggerAction"
import { defaultReactionTriggerEvents } from "../../../lib/defaultTriggerActions"

type Props = {}
const defaultAction = {
  subject: {
    id: "latest",
    type: "track",
  },
  target: {
    id: "latest",
    type: "track",
  },
  action: "likeTrack",
  meta: {
    messageTemplate: "",
  },
}

const ReactionTriggerActions = (props: Props) => {
  const [state, send] = useMachine(triggerEventsMachine)
  const { send: modalSend } = useModalsStore()
  const triggers = state.context.reactions
  const onCancel = () => modalSend("CLOSE")

  return (
    <Formik
      initialValues={{
        triggers: triggers.map((t) => mergician(defaultAction, t)),
      }}
      enableReinitialize
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values) => {
        send("SET_REACTION_TRIGGER_EVENTS", { data: values.triggers })
      }}
    >
      {({ values, handleSubmit }) => (
        <form onSubmit={handleSubmit}>
          <ModalBody>
            <VStack spacing={6}>
              <FormControl gap={2}>
                <FieldArray name="triggers">
                  {(actions) => {
                    const addAction = () => {
                      actions.push({ ...defaultAction })
                    }
                    const addDefaultActions = () => {
                      defaultReactionTriggerEvents.forEach((a) =>
                        actions.push(a),
                      )
                    }
                    return (
                      <VStack spacing={12}>
                        {values.triggers.map((trigger, index) => (
                          <FieldTriggerAction
                            key={index}
                            index={index}
                            value={trigger}
                            actions={actions}
                          />
                        ))}
                        <ButtonGroup>
                          <Button
                            onClick={addAction}
                            colorScheme="secondary"
                            size="sm"
                            rightIcon={<AddIcon boxSize="0.6rem" />}
                          >
                            Add Action
                          </Button>
                          <Button
                            onClick={addDefaultActions}
                            colorScheme="secondary"
                            size="sm"
                            variant="outline"
                            rightIcon={<AddIcon boxSize="0.6rem" />}
                          >
                            Add Default Actions
                          </Button>
                        </ButtonGroup>
                      </VStack>
                    )
                  }}
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
