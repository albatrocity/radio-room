import React from "react"
import { useMachine } from "@xstate/react"
import { FieldArray, Formik } from "formik"
import merge from "ts-deepmerge"

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
import {
  defaultMessageTriggerEvents,
  defaultReactionTriggerEvents,
} from "../../../lib/defaultTriggerActions"
import {
  MessageTriggerEvent,
  ReactionTriggerEvent,
  TriggerEventString,
} from "../../../types/Triggers"

type Props = {
  type: TriggerEventString
}

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

function getContextKey(type: TriggerEventString): "reactions" | "messages" {
  switch (type) {
    case "reaction":
      return "reactions"
    case "message":
      return "messages"
  }
}
function getDefaultTriggerEvents(
  type: TriggerEventString,
): ReactionTriggerEvent[] | MessageTriggerEvent[] {
  switch (type) {
    case "reaction":
      return defaultReactionTriggerEvents
    case "message":
      return defaultMessageTriggerEvents
  }
}

const TriggerActions = ({ type }: Props) => {
  const [state, send] = useMachine(triggerEventsMachine)
  const { send: modalSend } = useModalsStore()
  const triggers = state.context[getContextKey(type)]
  const defaultTriggerEvents = getDefaultTriggerEvents(type)
  const onCancel = () => modalSend("CLOSE")

  return (
    <Formik
      initialValues={{
        triggers: triggers.map((t) => merge(defaultAction, t)),
      }}
      enableReinitialize
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values) => {
        send(`SET_${type.toUpperCase()}_TRIGGER_EVENTS`, {
          data: values.triggers,
        })
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
                      defaultTriggerEvents.forEach((a) => actions.push(a))
                    }
                    return (
                      <VStack spacing={12}>
                        {values.triggers.map((trigger, index: number) => (
                          <FieldTriggerAction
                            key={index}
                            index={index}
                            value={trigger}
                            actions={actions}
                            eventType={type}
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
                          {defaultTriggerEvents.length > 0 && (
                            <Button
                              onClick={addDefaultActions}
                              colorScheme="secondary"
                              size="sm"
                              variant="outline"
                              rightIcon={<AddIcon boxSize="0.6rem" />}
                            >
                              Add Default Actions
                            </Button>
                          )}
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

export default TriggerActions
