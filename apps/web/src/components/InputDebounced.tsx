import React, { useMemo, useCallback } from "react"
import { Input, InputProps } from "@chakra-ui/react"

import { createDebouncedInputMachine } from "../machines/debouncedInputMachine"
import { useMachine } from "@xstate/react"

type Props = { onChange: (value: string) => void } & InputProps

function InputDebounced({ onChange, ...rest }: Props) {
  const handleChange = useCallback((value: string) => {
    onChange(value)
  }, [onChange])
  
  const debounceMachine = useMemo(
    () => createDebouncedInputMachine(handleChange),
    [handleChange]
  )
  
  const [_state, send] = useMachine(debounceMachine)

  return (
    <Input
      {...rest}
      onChange={(e) => {
        send({ type: "SET_VALUE", value: e.target.value })
      }}
    />
  )
}

export default InputDebounced
