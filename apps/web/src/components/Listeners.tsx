import React, { memo, useCallback } from "react"
import { Box, Button, ScrollArea } from "@chakra-ui/react"

import UserList from "./UserList"
import { User } from "../types/User"
import { useListeners, useCurrentRoomHasAudio } from "../hooks/useActors"
import ScrollShadowViewport from "./ScrollShadowViewport"

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
    <Box className="list-outer" h="100%" w="100%" layerStyle="themeTransition" overflow="hidden">
      <Box hideFrom="md">
        <Box px={2} py={1}>
          <Button onClick={handleListeners}>Listeners ({listenerCount})</Button>
        </Box>
      </Box>
      <Box hideBelow="md" h="100%" overflow="hidden">
        <ScrollArea.Root size="sm">
          <ScrollShadowViewport>
            <Box className="list-overflow" p={3}>
              <UserList onEditUser={onEditUser} showStatus={hasAudio} />
            </Box>
          </ScrollShadowViewport>
          <ScrollArea.Scrollbar orientation="vertical" />
        </ScrollArea.Root>
      </Box>
    </Box>
  )
}

export default memo(Listeners)
