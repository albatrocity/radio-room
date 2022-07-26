import React, { useContext, useEffect } from "react"
import { Box, Main } from "grommet"
import { useMachine } from "@xstate/react"
import { usePageVisibility } from "react-page-visibility"

import { GlobalStateContext } from "../contexts/global"
import useWindowSize from "./useWindowSize"
import Room from "./Room"
import { AuthProvider } from "../contexts/useAuth"
import { UsersProvider } from "../contexts/useUsers"
import { ReactionsProvider } from "../contexts/useReactions"
import { authMachine } from "../machines/authMachine"
import { usersMachine } from "../machines/usersMachine"
import { allReactionsMachine } from "../machines/allReactionsMachine"
import socket from "../lib/socket"

const RadioApp = () => {
  const [usersState, usersSend] = useMachine(usersMachine)
  const [reactionsState, reactionsSend] = useMachine(allReactionsMachine)
  const isVisible = usePageVisibility()
  const globalServices = useContext(GlobalStateContext)

  const size = useWindowSize()

  useEffect(() => {
    globalServices.authService.send("SETUP")
    return () => {
      globalServices.authService.send("USER_DISCONNECTED")
    }
  }, [globalServices.authService])

  useEffect(() => {
    if (isVisible) {
      globalServices.authService.send("SETUP")
    }
  }, [isVisible])

  return (
    <ReactionsProvider value={[reactionsState, reactionsSend]}>
      <UsersProvider value={[usersState, usersSend]}>
        <Main flex={{ grow: 1, shrink: 1 }}>
          <Room />
        </Main>
      </UsersProvider>
    </ReactionsProvider>
  )
}

export default RadioApp
