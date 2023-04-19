import React, { createContext } from "react"
import { useInterpret } from "@xstate/react"
import { roomMachine } from "../machines/roomMachine"
import { ActorRefFrom } from "xstate"

import { useCurrentUser, useAuthStore } from "../state/authStore"

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
  const { send: authSend } = useAuthStore()
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
      adminActivated: () => {
        authSend("ACTIVATE_ADMIN")
      },
      clearPlaylist: () => {
        socket.emit("clear playlist")
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
