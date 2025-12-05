import React from "react"
import { Input, InputProps } from "@chakra-ui/react"

import { debounceInputMachine } from "../machines/debouncedInputMachine"
import { useMachine } from "@xstate/react"

type Props = { onChange: (value: string) => void } & InputProps

function InputDebounced({ onChange, ...rest }: Props) {
  const [_state, send] = useMachine(debounceInputMachine, {
    actions: {
      onSearchChange: (_context, event) => {
        onChange(event.value)
      },
    },
  })

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
