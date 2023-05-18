import React from "react"
import { Input, InputProps } from "@chakra-ui/react"
import { useField } from "formik"

type Props = {
  name: string
} & InputProps

function FieldText({ name, ...rest }: Props) {
  const [field, , { setValue }] = useField(name)
  return (
    <Input
      name={name}
      onChange={(e) => setValue(e.target.value)}
      value={field.value}
      {...rest}
    />
  )
}

export default FieldText
