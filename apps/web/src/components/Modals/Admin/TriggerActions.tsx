import React from "react"
import { FieldArray, Formik } from "formik"

import {
  Button,
  Group,
  Field,
  DialogBody,
  DialogFooter,
  VStack,
} from "@chakra-ui/react"
import FormActions from "./FormActions"

import { useModalsStore } from "../../../state/modalsState"
import { LuPlus } from "react-icons/lu"
import FieldTriggerAction from "../../Fields/Triggers/FieldTriggerAction"

import { TriggerEvent, TriggerEventString } from "../../../types/Triggers"

type FormValues<T> = {
  triggers: TriggerEvent<T>[]
}

type Props<T> = {
  type: TriggerEventString
  initialValues: FormValues<T>
  defaultTriggerEvents: TriggerEvent<T>[]
  defaultAction: TriggerEvent<T>
  onSubmit: (values: FormValues<T>) => void
}

const TriggerActions = <T extends object>(props: Props<T>) => {
  const { type, initialValues, defaultTriggerEvents, defaultAction, onSubmit } =
    props
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
      {({ values, handleSubmit, dirty }) => (
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <VStack gap={6}>
              <Field.Root gap={2}>
                <FieldArray name="triggers">
                  {(actions) => {
                    const addAction = () => {
                      actions.push({ ...defaultAction })
                    }
                    const addDefaultActions = () => {
                      defaultTriggerEvents.forEach((a) => actions.push(a))
                    }
                    return (
                      <VStack gap={12}>
                        {values.triggers.map((trigger, index: number) => (
                          <FieldTriggerAction
                            key={index}
                            index={index}
                            value={trigger}
                            actions={actions}
                            eventType={type}
                          />
                        ))}
                        <Group>
                          <Button
                            onClick={addAction}
                            colorPalette="secondary"
                            size="sm"
                          >
                            Add Action
                            <LuPlus size="0.6rem" />
                          </Button>
                          {defaultTriggerEvents.length > 0 && (
                            <Button
                              onClick={addDefaultActions}
                              colorPalette="secondary"
                              size="sm"
                              variant="outline"
                            >
                              Add Default Actions
                              <LuPlus size="0.6rem" />
                            </Button>
                          )}
                        </Group>
                      </VStack>
                    )
                  }}
                </FieldArray>
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

export default TriggerActions
