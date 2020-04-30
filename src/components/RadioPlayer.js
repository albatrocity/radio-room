import React, { useState } from "react"
import {
  Box,
  Header,
  Main,
  Button,
  Icons,
  Heading,
  Paragraph,
  Menu,
  Sidebar,
  Nav,
  Avatar,
} from "grommet"

import ReactHowler from "react-howler"

const streamURL = "http://99.198.118.250:8391/stream?type=http&nocache=4"
// const streamURL = "78.129.178.98:9092/stream?type=http&icy=http"

const RadioPlayer = () => {
  const [playing, setPlaying] = useState(true)

  return (
    <Box>
      <ReactHowler src={[streamURL]} playing={playing} html5={true} />
    </Box>
  )
}

export default RadioPlayer
