import React, { memo, useCallback } from "react"
import { useMachine } from "@xstate/react"
import { Box, Button, Show, Flex } from "@chakra-ui/react"

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
  const [state] = useMachine(usersMachine)

  const {
    context: { listeners },
  } = state

  const handleListeners = useCallback(() => {
    onViewListeners(true)
  }, [onViewListeners])

  return (
    <Box className="list-outer" h="100%" w="100%">
      <Show below="sm">
        <Box px={2} py={1}>
          <Button onClick={handleListeners}>
            Listeners ({listeners.length})
          </Button>
        </Box>
      </Show>
      <Show above="sm">
        <Flex overflow="auto" className="list-overflow" p={3} grow={1} h="100%">
          <Box overflow={"auto"} h="100%" w="100%">
            <UserList onEditSettings={onEditSettings} onEditUser={onEditUser} />
          </Box>
        </Flex>
      </Show>
    </Box>
  )
}

export default memo(Listeners)
