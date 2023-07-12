import React, { memo, useCallback } from "react"
import { Box, Button, Show, Flex } from "@chakra-ui/react"

import UserList from "./UserList"
import { User } from "../types/User"
import { useListeners } from "../state/usersStore"
import { useCurrentRoomHasAudio } from "../state/roomStore"

interface ListenersProps {
  onViewListeners: (showListeners: boolean) => void
  onEditUser: (user: User) => void
}

const Listeners = ({ onViewListeners, onEditUser }: ListenersProps) => {
  const listenerCount = useListeners().length
  const hasAudio = useCurrentRoomHasAudio()

  const handleListeners = useCallback(() => {
    onViewListeners(true)
  }, [onViewListeners])

  return (
    <Box className="list-outer" h="100%" w="100%">
      <Show below="sm">
        <Box px={2} py={1}>
          <Button onClick={handleListeners}>Listeners ({listenerCount})</Button>
        </Box>
      </Show>
      <Show above="sm">
        <Flex overflow="auto" className="list-overflow" p={3} grow={1} h="100%">
          <Box overflow={"auto"} h="100%" w="100%">
            <UserList onEditUser={onEditUser} showStatus={hasAudio} />
          </Box>
        </Flex>
      </Show>
    </Box>
  )
}

export default memo(Listeners)
