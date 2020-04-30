import React, { useContext } from "react"
import { Box, List, Heading, Text } from "grommet"
import RoomContext from "../contexts/RoomContext"

const UserList = () => {
  const { state, dispatch } = useContext(RoomContext)
  return (
    <Box>
      <Heading level={3}>Listeners</Heading>
      {state.users.map(x => (
        <Text key={`${x.username}-${x.joinedAt}`}>{x.username}</Text>
      ))}
    </Box>
  )
}

export default UserList
