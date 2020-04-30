import React, { useContext } from "react"
import { Box, List, Heading, Text } from "grommet"
import RoomContext from "../contexts/RoomContext"

const NowPlaying = () => {
  const { state, dispatch } = useContext(RoomContext)
  return (
    <Box>
      <Heading level={3}>Now Playing</Heading>
      <Text>{state.meta.title}</Text>
    </Box>
  )
}

export default NowPlaying
