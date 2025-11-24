import React from "react"
import {
  NumberInputProps,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
} from "@chakra-ui/react"
import { useField } from "formik"

type Props = {
  name: string
} & NumberInputProps

function FieldNumber({ name, ...rest }: Props) {
  const [field, , { setValue }] = useField(name)
  return (
    <NumberInput name={name} onChange={setValue} value={field.value} {...rest}>
      <NumberInputField />
      <NumberInputStepper>
        <NumberIncrementStepper />
        <NumberDecrementStepper />
      </NumberInputStepper>
    </NumberInput>
  )
}

export default FieldNumber
