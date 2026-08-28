import { Stack, Text } from "@chakra-ui/react"
import type { TradeSession } from "@repo/types"

export function TradeSessionStatus({
  otherName,
  mine,
  theirs,
  bothLocked,
}: {
  otherName: string
  mine: TradeSession["participants"][string] | undefined
  theirs: TradeSession["participants"][string] | undefined
  bothLocked: boolean
}) {
  return (
    <Stack>
      {!mine?.locked && !theirs?.locked && (
        <Text fontSize="sm" color="fg.muted">
          Add items and lock your offer
        </Text>
      )}
      {mine?.locked && !bothLocked && (
        <Text fontSize="sm" color="fg.muted">
          Waiting for {otherName} to lock in their offer.
        </Text>
      )}
      {theirs?.locked && !mine?.locked && (
        <Text fontSize="sm" color="fg.muted">
          {otherName} is waiting for you to lock in your offer.
        </Text>
      )}
      {bothLocked && !mine?.confirmed && !theirs?.confirmed && (
        <Text fontSize="sm" color="fg.muted">
          Both parties have locked in their offers. Confirm the trade or back out.
        </Text>
      )}
      {theirs?.confirmed && !mine?.confirmed && (
        <Text fontSize="sm" color="fg.muted">
          {otherName} has confirmed the trade. Waiting for you to confirm.
        </Text>
      )}
      {mine?.confirmed && !theirs?.confirmed && (
        <Text fontSize="sm" color="fg.muted">
          You have confirmed the trade. Waiting for {otherName} to confirm.
        </Text>
      )}
    </Stack>
  )
}
