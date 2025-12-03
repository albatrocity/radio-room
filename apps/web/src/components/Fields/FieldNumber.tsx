import React from "react"
import { NumberInput } from "@chakra-ui/react"
import { useField } from "formik"

type Props = {
  name: string
} & Omit<NumberInput.RootProps, 'onChange'>

function FieldNumber({ name, ...rest }: Props) {
  const [field, , { setValue }] = useField(name)
  return (
    <NumberInput.Root
      name={name}
      onValueChange={(details) => setValue(details.value)}
      value={field.value}
      {...rest}
    >
      <NumberInput.Input />
      <NumberInput.Control>
        <NumberInput.IncrementTrigger />
        <NumberInput.DecrementTrigger />
      </NumberInput.Control>
    </NumberInput.Root>
  )
}

export default FieldNumber
