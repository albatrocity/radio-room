import { useContext } from "react"
import { CountdownTimerContext } from "./CountdownTimer"
import { HStack, Text } from "@chakra-ui/react"

type NowPlayingVoteCountdownProps = {
  reactionType: string
  isSkipped: boolean
}

export const NowPlayingVoteCountdown = ({
  reactionType,
  isSkipped,
}: NowPlayingVoteCountdownProps) => {
  const timer = useContext(CountdownTimerContext)
  if (!timer) {
    return null
  }

  const { remaining, isExpired } = timer

  if (isExpired) {
    if (isSkipped) {
      return (
        <Text color="primary.200" fontSize="sm">
          Track was skipped
        </Text>
      )
    }

    return null
  }

  return (
    <HStack gap={1}>
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
