import React, { useContext, useCallback } from "react"
import { uniqBy } from "lodash/fp"
import { Box, Heading, Text, Button, ResponsiveContext } from "grommet"

import UserList from "./UserList"
import RoomContext from "../contexts/RoomContext"

const Listeners = () => {
  const {
    state: { users },
    dispatch,
  } = useContext(RoomContext)
  const size = useContext(ResponsiveContext)
  const userList = uniqBy("userId", users)

  const isSmall = size === "small"

  const handleListeners = useCallback(
    () => dispatch({ type: "VIEW_LISTENERS", payload: true }),
    [dispatch]
  )

  return (
    <Box pad="small" className="list-outer" height="100%">
      {isSmall ? (
        <Box>
          <Button
            onClick={handleListeners}
            label={`Listeners (${userList.length})`}
          />
        </Box>
      ) : (
        <Heading level={3}>
          Listeners <Text size="small">({userList.length})</Text>
        </Heading>
      )}
      <Box
        flex={{ grow: 1, shrink: 1 }}
        height="1px"
        overflow="auto"
        className="list-overflow"
      >
        {!isSmall && <UserList />}
      </Box>
    </Box>
  )
}

export default Listeners
