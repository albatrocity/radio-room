import React, { createContext } from "react"
import { useInterpret } from "@xstate/react"
import { roomMachine } from "../machines/roomMachine"
import { ActorRefFrom } from "xstate"

import { useCurrentUser } from "../state/authStore"

import socket from "../lib/socket"

interface GlobalStateContextType {
  roomService: ActorRefFrom<typeof roomMachine>
}

export const GlobalStateContext = createContext(
  // Typed this way to avoid TS errors,
  // looks odd I know
  {} as GlobalStateContextType,
)

interface Props {
  children: JSX.Element
}

export const GlobalStateProvider = (props: Props) => {
  const currentUser = useCurrentUser()

  const roomService = useInterpret(roomMachine, {
    guards: {
      isAdmin: () => {
        return !!currentUser.isAdmin
      },
    },
    actions: {
      setDj: (_, event) => {
        if (event.type === "START_DJ_SESSION") {
          socket.emit("set DJ", currentUser.userId)
        } else {
          socket.emit("set DJ", null)
        }
      },
    },
  })

  return (
    <GlobalStateContext.Provider
      value={{
        roomService,
      }}
    >
      {props.children}
    </GlobalStateContext.Provider>
  )
}
