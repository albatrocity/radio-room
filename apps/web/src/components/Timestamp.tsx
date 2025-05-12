import React from "react"
import { HStack, Text } from "@chakra-ui/react"
import { format } from "date-fns"

type Props = {
  value: string
}

function Timestamp({ value }: Props) {
  const date = new Date(value)
  const time = format(date, "p")
  const dateString = format(date, "M/d/y")
  return (
    <HStack justifyContent="space-between">
      <HStack spacing={"1em"}>
        <Text fontSize="xs" opacity={0.6} color="secondaryText">
          {dateString}
        </Text>
        <Text fontSize="xs" color="secondaryText">
          {time}
        </Text>
      </HStack>
    </HStack>
  )
}

export default Timestamp
