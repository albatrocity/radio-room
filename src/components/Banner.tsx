import React from "react"
import { useBanner } from "../state/globalSettingsStore"
import ParsedEmojiMessage from "./ParsedEmojiMessage"
import { Box } from "@chakra-ui/react"

function Banner() {
  const banner = useBanner()
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
