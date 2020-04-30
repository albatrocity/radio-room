import React, { useReducer, useMemo } from "react"
import { Box, Heading, Paragraph, Header, Menu, Main } from "grommet"
import socketIOClient from "socket.io-client"

import Room from "./Room"
import RoomContext from "../contexts/RoomContext"
import SocketContext from "../contexts/SocketContext"
import roomReducer, { initialState } from "../reducers/roomReducer"

const socketEndPoint = process.env.GATSBY_API_URL
const socket = socketIOClient(socketEndPoint)

const RadioApp = () => {
  const [state, dispatch] = useReducer(roomReducer, initialState)

  const contextValue = useMemo(() => {
    return { state, dispatch }
  }, [state, dispatch])

  return (
    <SocketContext.Provider value={{ socket }}>
      <RoomContext.Provider value={contextValue}>
        <Box>
          <Header background="brand">
            <Menu label="account" items={[{ label: "logout" }]} />
          </Header>
          <Box direction="row">
            <Main pad="large">
              <Room />
            </Main>
          </Box>
        </Box>
      </RoomContext.Provider>
    </SocketContext.Provider>
  )
}

export default RadioApp
