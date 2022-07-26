import React, { createContext } from "react"
import { useInterpret } from "@xstate/react"
import { authMachine } from "../machines/authMachine"
import { chatMachine } from "../machines/chatMachine"
import { roomMachine } from "../machines/roomMachine"
import { usersMachine } from "../machines/usersMachine"
import { ActorRefFrom } from "xstate"

interface GlobalStateContextType {
  authService: ActorRefFrom<typeof authMachine>
  chatService: ActorRefFrom<typeof chatMachine>
  roomService: ActorRefFrom<typeof roomMachine>
  usersService: ActorRefFrom<typeof usersMachine>
}

export const GlobalStateContext = createContext(
  // Typed this way to avoid TS errors,
  // looks odd I know
  {} as GlobalStateContextType,
)

export const GlobalStateProvider = (props) => {
  const authService = useInterpret(authMachine)
  const chatService = useInterpret(chatMachine)
  const roomService = useInterpret(roomMachine)
  const usersService = useInterpret(usersMachine)

  return (
    <GlobalStateContext.Provider
      value={{ authService, roomService, usersService, chatService }}
    >
      {props.children}
    </GlobalStateContext.Provider>
  )
}
