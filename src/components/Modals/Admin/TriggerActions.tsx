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
import { AddIcon } from "@chakra-ui/icons"
import FieldTriggerAction from "../../Fields/Triggers/FieldTriggerAction"

import { TriggerEvent, TriggerEventString } from "../../../types/Triggers"
import { Reaction } from "../../../types/Reaction"
import { ChatMessage } from "../../../types/ChatMessage"

type FormValues<T> = {
  triggers: TriggerEvent<T>[]
}

type Props<T> = {
  type: TriggerEventString
  initialValues: FormValues<T>
  defaultTriggerEvents: TriggerEvent<T>[]
  onSubmit: (values: FormValues<T>) => void
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

const TriggerActions = <T extends object>(props: Props<T>) => {
  const { type, initialValues, defaultTriggerEvents, onSubmit } = props
  const { send: modalSend } = useModalsStore()
  const onCancel = () => modalSend("CLOSE")

  return (
    <Formik
      initialValues={initialValues}
      enableReinitialize
      validate={() => {
        const errors = {}
        return errors
      }}
      onSubmit={(values) => {
        onSubmit(values)
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
