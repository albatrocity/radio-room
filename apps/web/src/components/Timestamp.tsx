import React from "react"
import { HStack, Text } from "@chakra-ui/react"
import { format } from "date-fns"

type Props = {
  value: string | number // Supports ISO date strings or timestamps
  color?: "primaryText" | "secondaryText"
}

function Timestamp({ value, color = "secondaryText" }: Props) {
  // Handle both timestamp numbers (e.g., Date.now() => 1234567890123)
  // and date strings (e.g., "2024-01-01" or ISO strings)
  const date = new Date(value)

  // Return null for invalid dates
  if (Number.isNaN(date.getTime())) {
    console.warn(`Invalid date value provided to Timestamp: ${value}`)
    return null
  }

  const time = format(date, "p")
  const dateString = format(date, "M/d/y")

  return (
    <HStack justifyContent="space-between">
      <HStack spacing={"1em"}>
        <Text fontSize="xs" opacity={0.6} color={color}>
          {dateString}
        </Text>
        <Text fontSize="xs" color={color}>
          {time}
        </Text>
      </HStack>
    </HStack>
  )
}

export default Timestamp
