import React, { ReactNode } from "react"
import { NativeSelect } from "@chakra-ui/react"
import { useField } from "formik"

type Props = {
  name: string
  children: ReactNode
} & NativeSelect.RootProps

function FieldSelect({ name, children, ...rest }: Props) {
  const [field, , { setValue }] = useField(name)

  return (
    <NativeSelect.Root {...rest}>
      <NativeSelect.Field
        name={name}
        onChange={(e) => setValue(e.target.value)}
        value={field.value}
      >
        {children}
      </NativeSelect.Field>
    </NativeSelect.Root>
  )
}

export default FieldSelect
