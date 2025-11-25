import { useContext } from "react"
import { CountdownTimerContext } from "./CountdownTimer"
import { HStack, Text } from "@chakra-ui/react"

type NowPlayingVoteCountdownProps = {
  reactionType: string
}

export const NowPlayingVoteCountdown = ({ reactionType }: NowPlayingVoteCountdownProps) => {
  const timer = useContext(CountdownTimerContext)
  if (!timer) {
    return null
  }

  const { remaining, isExpired } = timer

  if (isExpired) {
    return (
      <Text color="primary.200" fontSize="sm">
        Voting time has expired
      </Text>
    )
  }

  return (
    <HStack spacing={1}>
      <Text color="primary.200" fontSize="sm">
        {Math.ceil(remaining / 1000)}
      </Text>
      <Text as="span" color="primary.200" fontSize="sm">
        seconds remaining to vote {/* @ts-ignore */}
        <em-emoji shortcodes={`:${reactionType}:`} />
      </Text>
    </HStack>
  )
}
