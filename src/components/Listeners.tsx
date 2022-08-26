import React, { useContext, useCallback } from "react"
import { useMachine } from "@xstate/react"
import { Box, Button, ResponsiveContext } from "grommet"

import { usersMachine } from "../machines/usersMachine"

import UserList from "./UserList"
import { User } from "../types/User"

interface ListenersProps {
  onViewListeners: (showListeners: boolean) => void
  onEditUser: (user: User) => void
  onEditSettings: () => void
}

const Listeners = ({
  onViewListeners,
  onEditUser,
  onEditSettings,
}: ListenersProps) => {
  const size = useContext(ResponsiveContext)
  const [state] = useMachine(usersMachine)

  const {
    context: { listeners },
  } = state

  const isSmall = size === "small"

  const handleListeners = useCallback(() => {
    onViewListeners(true)
  }, [onViewListeners])

  return (
    <Box className="list-outer" height="100%">
      {isSmall && (
        <Box pad={{ horizontal: "medium", vertical: "small" }}>
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
            <Box pad="medium">
              <UserList
                onEditSettings={onEditSettings}
                onEditUser={onEditUser}
              />
            </Box>
          </div>
        )}
      </Box>
    </Box>
  )
}

export default Listeners
