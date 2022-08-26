import React, { createContext } from "react"
import { useInterpret, useSelector } from "@xstate/react"
import { authMachine } from "../machines/authMachine"
import { chatMachine } from "../machines/chatMachine"
import { roomMachine } from "../machines/roomMachine"
import { usersMachine } from "../machines/usersMachine"
import { allReactionsMachine } from "../machines/allReactionsMachine"
import { ActorRefFrom } from "xstate"

import socket from "../lib/socket"

interface GlobalStateContextType {
  authService: ActorRefFrom<typeof authMachine>
  chatService: ActorRefFrom<typeof chatMachine>
  roomService: ActorRefFrom<typeof roomMachine>
  usersService: ActorRefFrom<typeof usersMachine>
  allReactionsService: ActorRefFrom<typeof allReactionsMachine>
}

export const GlobalStateContext = createContext(
  // Typed this way to avoid TS errors,
  // looks odd I know
  {} as GlobalStateContextType,
)

const currentUserSelector = (state) => state.context.currentUser

export const GlobalStateProvider = (props) => {
  const authService = useInterpret(authMachine)
  const chatService = useInterpret(chatMachine)

  const currentUser = useSelector(authService, currentUserSelector)

  const checkDj = (_, event) => {
    const isDj = event.data.users.find((x) => x.userId === currentUser.userId)
      ?.isDj
    if (!isDj) {
      console.log("NO DJ")
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
        allReactionsService,
      }}
    >
      {props.children}
    </GlobalStateContext.Provider>
  )
}
