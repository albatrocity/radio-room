import React, { useReducer, useMemo } from "react"
import { Box, Heading, Paragraph, Header, Menu, Main } from "grommet"

import useWindowSize from "./useWindowSize"
import Room from "./Room"
import RoomContext from "../contexts/RoomContext"
import SocketContext from "../contexts/SocketContext"
import PlayerContext from "../contexts/PlayerContext"
import roomReducer, { initialState } from "../reducers/roomReducer"
import playerReducer, {
  initialState as playerInitialState,
} from "../reducers/playerReducer"

import socket from "../lib/socket"

const RadioApp = () => {
  const [state, dispatch] = useReducer(roomReducer, initialState)
  const size = useWindowSize()

  const contextValue = useMemo(() => {
    return { state, dispatch }
  }, [state, dispatch])

  const [playerState, playerDispatch] = useReducer(
    playerReducer,
    playerInitialState
  )

  const playerContextValue = useMemo(() => {
    return { state: playerState, dispatch: playerDispatch }
  }, [playerState, playerDispatch])

  return (
    <SocketContext.Provider value={{ socket }}>
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
