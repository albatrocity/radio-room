import React from "react"
import { useRoomBanner } from "../state/roomStore"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { Box } from "@chakra-ui/react"

function Banner() {
  const banner = useRoomBanner()
  if (!banner) {
    return null
  }

  return (
    <Box p={4} bg="appBg" w="100%" fontSize="sm">
      <ParsedEmojiMessage content={banner} />
    </Box>
  )
}

export default Banner
