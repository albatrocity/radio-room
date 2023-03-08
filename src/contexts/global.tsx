import React, { createContext } from "react"
import { useInterpret, useSelector } from "@xstate/react"
import { authMachine } from "../machines/authMachine"
import { chatMachine } from "../machines/chatMachine"
import { roomMachine } from "../machines/roomMachine"
import { usersMachine } from "../machines/usersMachine"
import { themeMachine } from "../machines/themeMachine"
import { playlistMachine } from "../machines/playlistMachine"
import { toggleableCollectionMachine } from "../machines/toggleableCollectionMachine"
import { allReactionsMachine } from "../machines/allReactionsMachine"
import { ActorRefFrom } from "xstate"

import socket from "../lib/socket"
import { disclosureMachine } from "../machines/disclosureMachine"

interface GlobalStateContextType {
  allReactionsService: ActorRefFrom<typeof allReactionsMachine>
  authService: ActorRefFrom<typeof authMachine>
  bookmarkedChatService: ActorRefFrom<typeof toggleableCollectionMachine>
  chatService: ActorRefFrom<typeof chatMachine>
  disclosureService: ActorRefFrom<typeof disclosureMachine>
  playlistService: ActorRefFrom<typeof playlistMachine>
  roomService: ActorRefFrom<typeof roomMachine>
  themeService: ActorRefFrom<typeof themeMachine>
  usersService: ActorRefFrom<typeof usersMachine>
}

export const GlobalStateContext = createContext(
  // Typed this way to avoid TS errors,
  // looks odd I know
  {} as GlobalStateContextType,
)

const currentUserSelector = (state) => state.context.currentUser

interface Props {
  children: JSX.Element
}

export const GlobalStateProvider = (props: Props) => {
  const authService = useInterpret(authMachine, {})
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

  const currentUser = useSelector(authService, currentUserSelector)

  const roomService = useInterpret(roomMachine, {
    guards: {
      isAdmin: () => {
        return currentUser.isAdmin
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
        authService.send("ACTIVATE_ADMIN")
      },
      clearPlaylist: () => {
        socket.emit("clear playlist")
      },
    },
  })

  const usersService = useInterpret(usersMachine)
  const allReactionsService = useInterpret(allReactionsMachine)
  const disclosureService = useInterpret(disclosureMachine, {
    context: {
      currentUser,
    },
  })

  return (
    <GlobalStateContext.Provider
      value={{
        allReactionsService,
        authService,
        bookmarkedChatService,
        chatService,
        disclosureService,
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
