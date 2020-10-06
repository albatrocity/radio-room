import React, { memo } from "react"
import { Image } from "grommet"

const AlbumArtwork = ({ coverUrl, onCover }) => (
  <Image
    onError={() => {
      onCover(false)
    }}
    height="small"
    width="small"
    src={coverUrl}
  />
)

export default memo(AlbumArtwork)
