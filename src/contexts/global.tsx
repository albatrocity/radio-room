import React, { createContext } from "react"
import { useInterpret } from "@xstate/react"
import { audioMachine } from "../machines/audioMachine"
import { roomMachine } from "../machines/roomMachine"
import { ActorRefFrom } from "xstate"

import { useCurrentUser, useAuthStore } from "../state/authStore"

import socket from "../lib/socket"

interface GlobalStateContextType {
  roomService: ActorRefFrom<typeof roomMachine>
  audioService: ActorRefFrom<typeof audioMachine>
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

  const audioService = useInterpret(audioMachine)

  return (
    <GlobalStateContext.Provider
      value={{
        audioService,
        roomService,
      }}
    >
      {props.children}
    </GlobalStateContext.Provider>
  )
}
