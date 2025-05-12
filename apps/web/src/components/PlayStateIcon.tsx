import React from "react"
import { Spinner, Icon } from "@chakra-ui/react"
import { FiPause, FiPlay } from "react-icons/fi"

type Props = {
  loading: boolean
  playing: boolean
}

const PlayStateIcon = ({ playing, loading }: Props) => {
  if (loading) {
    return <Spinner />
  }
  if (playing) {
    return <Icon as={FiPause} boxSize={5} />
  }
  return <Icon as={FiPlay} boxSize={5} />
}

export default PlayStateIcon
