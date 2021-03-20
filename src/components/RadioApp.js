import React, { useMemo, useEffect } from "react"
import { Box, Main } from "grommet"
import { useService, useMachine } from "@xstate/react"
import { usePageVisibility } from "react-page-visibility"

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
  const [authState, authSend] = useMachine(authMachine)
  const [usersState, usersSend] = useMachine(usersMachine)
  const [reactionsState, reactionsSend] = useMachine(allReactionsMachine)
  const isVisible = usePageVisibility()

  const size = useWindowSize()

  useEffect(() => {
    authSend("SETUP")
    return () => {
      authSend("USER_DISCONNECTED")
    }
  }, [authSend])

  useEffect(() => {
    if (isVisible && socket.disconnected) {
      authSend("SETUP")
    }
  }, [isVisible])

  return (
    <AuthProvider value={[authState, authSend]}>
      <ReactionsProvider value={[reactionsState, reactionsSend]}>
        <UsersProvider value={[usersState, usersSend]}>
          <Main flex={{ grow: 1, shrink: 1 }}>
            <Room />
          </Main>
        </UsersProvider>
      </ReactionsProvider>
    </AuthProvider>
  )
}

export default RadioApp
