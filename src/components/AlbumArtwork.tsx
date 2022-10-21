import React, { memo } from "react"
import { Image, Box } from "@chakra-ui/react"

interface AlbumArtworkProps {
  coverUrl: string
  onCover: (hasArtwork: boolean) => void
}

const AlbumArtwork = ({ coverUrl, onCover }: AlbumArtworkProps) => (
  <Box>
    <Image
      onError={() => {
        onCover(false)
      }}
      height="100%"
      width="100%"
      src={coverUrl}
    />
  </Box>
)

export default memo(AlbumArtwork)
