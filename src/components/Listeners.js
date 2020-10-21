import React, { useContext, useEffect, useCallback } from "react"
import { useMachine, useService } from "@xstate/react"
import { uniqBy, sortBy, reject, find } from "lodash/fp"
import { Box, Heading, Text, Button, ResponsiveContext } from "grommet"

import { usersMachine } from "../machines/usersMachine"
import { dataService } from "../machines/dataMachine"
import { typingMachine } from "../machines/typingMachine"
import UserList from "./UserList"

const Listeners = ({ onViewListeners, onEditUser, onEditSettings }) => {
  const size = useContext(ResponsiveContext)
  const [state, send] = useMachine(usersMachine)

  const {
    context: { listeners, dj, currentUser },
  } = state

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
            <UserList onEditSettings={onEditSettings} onEditUser={onEditUser} />
          </div>
        )}
      </Box>
    </Box>
  )
}

export default Listeners
