import React, { useMemo, useEffect } from "react"
import { Box, Main } from "grommet"
import { useMachine } from "@xstate/react"

import useWindowSize from "./useWindowSize"
import Room from "./Room"
import AuthContext from "../contexts/AuthContext"
import { ChatReactionsProvider } from "../contexts/useChatReactions"
import { TrackReactionsProvider } from "../contexts/useTrackReactions"
import { UsersProvider } from "../contexts/useUsers"
import { authMachine } from "../machines/authMachine"
import { getCurrentUser } from "../lib/getCurrentUser"
import socket from "../lib/socket"

const RadioApp = () => {
  const [authState, authSend] = useMachine(authMachine, {
    actions: {
      getCurrentUser: (context, event) => {
        const { currentUser, isNewUser } = getCurrentUser(event.data)
        authSend({ type: "CREDENTIALS", data: { currentUser, isNewUser } })
      },
      disconnectUser: (context, event) => {
        if (!context.shouldRetry) {
          socket.close()
          socket.emit("disconnect", context.currentUser.userId)
        }
      },
    },
  })

  const size = useWindowSize()
  const authContextValue = useMemo(
    () => ({ state: authState, send: authSend }),
    [authState, authSend]
  )

  useEffect(() => {
    authSend("SETUP", { origin: "dsakdjkdas" })
    return () => {
      authSend("USER_DISCONNECTED")
    }
  }, [authSend])

  return (
    <AuthContext.Provider value={authContextValue}>
      <ChatReactionsProvider>
        <TrackReactionsProvider>
          <UsersProvider>
            <Box height={size[1] ? `${size[1]}px` : "100vh"}>
              <Main flex={{ grow: 1, shrink: 1 }}>
                <pre>{JSON.stringify(authState.value)}</pre>
                <Room />
              </Main>
            </Box>
          </UsersProvider>
        </TrackReactionsProvider>
      </ChatReactionsProvider>
    </AuthContext.Provider>
  )
}

export default RadioApp
