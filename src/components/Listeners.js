import React, { useContext, useCallback } from "react"
import { uniqBy, sortBy, reject, find } from "lodash/fp"
import { Box, Heading, Text, Button, ResponsiveContext } from "grommet"

import { useUsers } from "../contexts/useUsers"
import UserList from "./UserList"

const Listeners = ({
  onViewListeners,
  onEditUser,
  onKickUser,
  onEditSettings,
}) => {
  const size = useContext(ResponsiveContext)
  const {
    state: { listeners, dj, typing },
  } = useUsers()

  const isSmall = size === "small"

  const handleListeners = useCallback(() => {
    onViewListeners(true)
  }, [onViewListeners])

  return (
    <Box pad="medium" className="list-outer" height="100%">
      {isSmall && (
        <Box>
          <Button
            onClick={handleListeners}
            label={`Listeners (${listeners.length})`}
          />
        </Box>
      )}
      <Box
        flex={{ grow: 1, shrink: 1 }}
        height="1px"
        overflow="auto"
        className="list-overflow"
      >
        {!isSmall && (
          <div>
            <UserList
              listeners={listeners}
              dj={dj}
              onEditSettings={onEditSettings}
              onEditUser={onEditUser}
              onKickUser={onKickUser}
              typing={typing}
            />
          </div>
        )}
      </Box>
    </Box>
  )
}

export default Listeners
