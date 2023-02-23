import React from "react"
import { Input } from "@chakra-ui/react"

import { debounceInputMachine } from "../machines/debouncedInputMachine"
import { useMachine } from "@xstate/react"
import useGlobalContext from "./useGlobalContext"

type Props = { onChange: (value: string) => void }

function InputDebounced({}: Props) {
  const globalServices = useGlobalContext()
  const [state, send] = useMachine(debounceInputMachine, {
    actions: {
      onSearchChange: (context, event) => {
        console.log("final value", event.value)
        // globalServices.roomService.send()
      },
    },
  })

  return (
    <Input
      onChange={(e) => {
        send("SET_VALUE", { value: e.target.value })
      }}
    />
  )
}

export default InputDebounced
