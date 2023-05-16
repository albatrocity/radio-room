import React, { ReactNode } from "react"
import { Select, SelectProps } from "@chakra-ui/react"
import { useField } from "formik"

type Props = {
  name: string
  children: ReactNode
} & SelectProps

function FieldSelect({ name, children, ...rest }: Props) {
  const [field, , { setValue }] = useField(name)
  return (
    <Select name={name} onChange={setValue} value={field.value} {...rest}>
      {children}
    </Select>
  )
}

export default FieldSelect
