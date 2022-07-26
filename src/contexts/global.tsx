import React, { createContext } from "react"
import { useInterpret } from "@xstate/react"
import { authMachine } from "../machines/authMachine"
import { chatMachine } from "../machines/chatMachine"
import { roomMachine } from "../machines/roomMachine"
import { ActorRefFrom } from "xstate"

interface GlobalStateContextType {
  authService: ActorRefFrom<typeof authMachine>
  chatService: ActorRefFrom<typeof chatMachine>
  roomService: ActorRefFrom<typeof roomMachine>
}

export const GlobalStateContext = createContext(
  // Typed this way to avoid TS errors,
  // looks odd I know
  {} as GlobalStateContextType,
)

export const GlobalStateProvider = (props) => {
  // const authService = useInterpret(authMachine)
  // const chatService = useInterpret(chatMachine)
  const roomService = useInterpret(roomMachine)

  return (
    <GlobalStateContext.Provider value={{ roomService }}>
      {props.children}
    </GlobalStateContext.Provider>
  )
}
