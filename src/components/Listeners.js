import React, { useContext, useCallback } from "react"
import { uniqBy } from "lodash/fp"
import { Box, Heading, Text, Button, ResponsiveContext } from "grommet"

import UserList from "./UserList"

const Listeners = ({ users, onViewListeners, onEditUser }) => {
  const size = useContext(ResponsiveContext)
  const userList = uniqBy("userId", users)

  const isSmall = size === "small"

  const handleListeners = useCallback(() => {
    onViewListeners(true)
  }, [onViewListeners])

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
        {!isSmall && <UserList users={users} onEditUser={onEditUser} />}
      </Box>
    </Box>
  )
}

export default Listeners
