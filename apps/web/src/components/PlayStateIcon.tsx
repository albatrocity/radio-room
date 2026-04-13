import React from "react"
import { Spinner, Icon } from "@chakra-ui/react"
import { LuPause, LuPlay } from "react-icons/lu"

type Props = {
  loading: boolean
  playing: boolean
}

const PlayStateIcon = ({ playing, loading }: Props) => {
  if (loading) {
    return <Spinner />
  }
  if (playing) {
    return <Icon as={LuPause} boxSize={5} />
  }
  return <Icon as={LuPlay} boxSize={5} />
}

export default PlayStateIcon
