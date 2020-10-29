import React, { memo } from "react"
import { Image, Box } from "grommet"

const AlbumArtwork = ({ coverUrl, onCover }) => (
  <Box width="small" height="small">
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
