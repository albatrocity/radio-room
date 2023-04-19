import React, { createContext } from "react"
import { useInterpret } from "@xstate/react"
import { audioMachine } from "../machines/audioMachine"
import { chatMachine } from "../machines/chatMachine"
import { roomMachine } from "../machines/roomMachine"
import { usersMachine } from "../machines/usersMachine"
import { themeMachine } from "../machines/themeMachine"
import { playlistMachine } from "../machines/playlistMachine"
import { toggleableCollectionMachine } from "../machines/toggleableCollectionMachine"
import { allReactionsMachine } from "../machines/allReactionsMachine"
import { ActorRefFrom } from "xstate"

import { useCurrentUser, useAuthStore } from "../state/authStore"

import socket from "../lib/socket"

interface GlobalStateContextType {
  allReactionsService: ActorRefFrom<typeof allReactionsMachine>
  bookmarkedChatService: ActorRefFrom<typeof toggleableCollectionMachine>
  chatService: ActorRefFrom<typeof chatMachine>
  playlistService: ActorRefFrom<typeof playlistMachine>
  roomService: ActorRefFrom<typeof roomMachine>
  themeService: ActorRefFrom<typeof themeMachine>
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
  const chatService = useInterpret(chatMachine)
  const bookmarkedChatService = useInterpret(toggleableCollectionMachine, {
    context: {
      name: "bookmarks",
      idPath: "id",
      persistent: true,
    },
  })
  const themeService = useInterpret(themeMachine)
  const playlistService = useInterpret(playlistMachine)

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
  const allReactionsService = useInterpret(allReactionsMachine)
  const audioService = useInterpret(audioMachine)

  return (
    <GlobalStateContext.Provider
      value={{
        allReactionsService,
        audioService,
        bookmarkedChatService,
        chatService,
        playlistService,
        roomService,
        themeService,
        usersService,
      }}
    >
      {props.children}
    </GlobalStateContext.Provider>
  )
}
