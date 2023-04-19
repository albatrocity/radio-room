import React, { createContext } from "react"
import { useInterpret } from "@xstate/react"
import { audioMachine } from "../machines/audioMachine"
import { roomMachine } from "../machines/roomMachine"
import { usersMachine } from "../machines/usersMachine"
import { toggleableCollectionMachine } from "../machines/toggleableCollectionMachine"
import { ActorRefFrom } from "xstate"

import { useCurrentUser, useAuthStore } from "../state/authStore"

import socket from "../lib/socket"

interface GlobalStateContextType {
  bookmarkedChatService: ActorRefFrom<typeof toggleableCollectionMachine>
  roomService: ActorRefFrom<typeof roomMachine>
  usersService: ActorRefFrom<typeof usersMachine>
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
  const bookmarkedChatService = useInterpret(toggleableCollectionMachine, {
    context: {
      name: "bookmarks",
      idPath: "id",
      persistent: true,
    },
  })

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

  const usersService = useInterpret(usersMachine)
  const audioService = useInterpret(audioMachine)

  return (
    <GlobalStateContext.Provider
      value={{
        audioService,
        bookmarkedChatService,
        roomService,
        usersService,
      }}
    >
      {props.children}
    </GlobalStateContext.Provider>
  )
}
