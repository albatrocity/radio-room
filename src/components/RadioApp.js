import React, { useMemo, useEffect } from "react"
import { Box, Main } from "grommet"
import { useMachine } from "@xstate/react"

import useWindowSize from "./useWindowSize"
import Room from "./Room"
import AuthContext from "../contexts/AuthContext"
import { authMachine } from "../machines/authMachine"
import { getCurrentUser } from "../lib/getCurrentUser"
import socket from "../lib/socket"

const RadioApp = () => {
  const [authState, authSend] = useMachine(authMachine, {
    actions: {
      setupListeners: ctx => {
        const handleInit = payload => {
          authSend({ type: "LOGIN", data: payload })
        }
        socket.on("init", handleInit)

        socket.on("disconnect", () => {
          authSend("USER_DISCONNECTED")
        })
        socket.on("kicked", () => {
          authSend({ type: "USER_DISCONNECTED", shouldRetry: false })
        })

        return () => {
          socket.removeListener("init", handleInit)
        }
      },
      getCurrentUser: (context, event) => {
        const { currentUser, isNewUser } = getCurrentUser(event.data)
        authSend({ type: "CREDENTIALS", data: { currentUser, isNewUser } })
      },
      login: (context, event) => {
        socket.emit("login", {
          username: context.currentUser.username,
          userId: context.currentUser.userId,
        })
      },
      disconnectUser: (context, event) => {
        if (!context.shouldRetry) {
          socket.close()
          socket.emit("disconnect", context.currentUser.userId)
        }
      },
      changeUsername: (context, event) => {
        socket.emit("change username", {
          userId: context.currentUser.userId,
          username: context.currentUser.username,
        })
      },
    },
  })

  const size = useWindowSize()
  const authContextValue = useMemo(
    () => ({ state: authState, send: authSend }),
    [authState, authSend]
  )

  useEffect(() => {
    authSend("SETUP")
    return () => {
      authSend("USER_DISCONNECTED")
    }
  }, [authSend])

  return (
    <AuthContext.Provider value={authContextValue}>
      <Box height={size[1] ? `${size[1]}px` : "100vh"}>
        <Main flex={{ grow: 1, shrink: 1 }}>
          <Room />
        </Main>
      </Box>
    </AuthContext.Provider>
  )
}

export default RadioApp
