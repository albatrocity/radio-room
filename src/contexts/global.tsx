import React, { createContext } from "react"
import { useInterpret, useSelector } from "@xstate/react"
import { authMachine } from "../machines/authMachine"
import { chatMachine } from "../machines/chatMachine"
import { roomMachine } from "../machines/roomMachine"
import { usersMachine } from "../machines/usersMachine"
import { themeMachine } from "../machines/themeMachine"
import { allReactionsMachine } from "../machines/allReactionsMachine"
import { ActorRefFrom } from "xstate"

import socket from "../lib/socket"
import { User } from "../types/User"

interface GlobalStateContextType {
  authService: ActorRefFrom<typeof authMachine>
  chatService: ActorRefFrom<typeof chatMachine>
  roomService: ActorRefFrom<typeof roomMachine>
  themeService: ActorRefFrom<typeof themeMachine>
  usersService: ActorRefFrom<typeof usersMachine>
  allReactionsService: ActorRefFrom<typeof allReactionsMachine>
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
  const authService = useInterpret(authMachine)
  const chatService = useInterpret(chatMachine)
  const themeService = useInterpret(themeMachine)

  const currentUser = useSelector(authService, currentUserSelector)

  const checkDj = (_, event) => {
    const isDj = event.data.users.find(
      (x: User) => x.userId === currentUser.userId,
    )?.isDj
    if (!isDj) {
      roomService.send("END_DJ_SESSION")
    }
  }

  const roomService = useInterpret(roomMachine, {
    actions: {
      setDj: (_, event) => {
        if (event.type === "START_DJ_SESSION") {
          socket.emit("set DJ", currentUser.userId)
        } else {
          socket.emit("set DJ", null)
        }
      },
      checkDj,
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

  return (
    <GlobalStateContext.Provider
      value={{
        authService,
        roomService,
        usersService,
        chatService,
        themeService,
        allReactionsService,
      }}
    >
      {props.children}
    </GlobalStateContext.Provider>
  )
}
