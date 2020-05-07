import React, { useReducer, useMemo } from "react"
import { Box, Heading, Paragraph, Header, Menu, Main } from "grommet"
import { useMachine } from "@xstate/react"

import useWindowSize from "./useWindowSize"
import Room from "./Room"
import RoomContext from "../contexts/RoomContext"
import SocketContext from "../contexts/SocketContext"
import PlayerContext from "../contexts/PlayerContext"
import { roomMachine } from "../machines/roomMachine"
import roomReducer, { initialState } from "../reducers/roomReducer"
import playerReducer, {
  initialState as playerInitialState,
} from "../reducers/playerReducer"

import socket from "../lib/socket"

const RadioApp = () => {
  const [state, dispatch] = useReducer(roomReducer, initialState)
  const [roomState, roomSend, roomService] = useMachine(roomMachine)

  const size = useWindowSize()

  const contextValue = useMemo(() => {
    return {
      state: roomState.context,
      machine: roomState,
      send: roomSend,
      service: roomService,
    }
  }, [roomState, roomSend])

  const [playerState, playerDispatch] = useReducer(
    playerReducer,
    playerInitialState
  )

  const socketContextValue = useMemo(() => {
    return { socket }
  }, [socket])

  const playerContextValue = useMemo(() => {
    return { state: playerState, dispatch: playerDispatch }
  }, [playerState, playerDispatch])

  return (
    <SocketContext.Provider value={socketContextValue}>
      <RoomContext.Provider value={contextValue}>
        <PlayerContext.Provider value={playerContextValue}>
          <Box height={size[1] ? `${size[1]}px` : "100vh"}>
            <Main flex={{ grow: 1, shrink: 1 }}>
              <Room />
            </Main>
          </Box>
        </PlayerContext.Provider>
      </RoomContext.Provider>
    </SocketContext.Provider>
  )
}

export default RadioApp
