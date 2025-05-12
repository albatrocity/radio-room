import React, { memo } from "react"
import { Image, Box } from "@chakra-ui/react"

interface AlbumArtworkProps {
  coverUrl: string
}

const AlbumArtwork = ({ coverUrl }: AlbumArtworkProps) => (
  <Box>
    <Image height="100%" width="100%" src={coverUrl} />
  </Box>
)

export default memo(AlbumArtwork)
