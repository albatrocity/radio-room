import React from "react"
import { VStack, Box, Text, HStack, RadioGroup } from "@chakra-ui/react"
import { LuCheck } from "react-icons/lu"

import { Room } from "../../types/Room"

type Props = {
  onSelect: (type: Partial<Room["type"]>) => void
}

type RadioTypeCardProps = {
  title: string
  description: string
  value: string
  checked?: boolean
}

function RoomTypeCard({ title, description, value, checked }: RadioTypeCardProps) {
  return (
    <RadioGroup.Item value={value} w="100%">
      <RadioGroup.ItemHiddenInput />
      <Box
        as="label"
        w="100%"
        cursor="pointer"
        borderWidth="1px"
        borderRadius="md"
        boxShadow="sm"
        px={5}
        py={3}
        bg={checked ? "primary.50" : undefined}
        borderColor={checked ? "primary.600" : undefined}
        _focus={{
          boxShadow: "outline",
        }}
        _dark={{
          bg: checked ? "primary.600" : undefined,
          borderColor: checked ? "primary.500" : undefined,
        }}
      >
        <RadioGroup.ItemControl />
        <HStack>
          <Text fontSize="lg" fontWeight={700}>
            {title}
          </Text>
          {checked && <LuCheck color="var(--chakra-colors-secondary-500)" />}
        </HStack>
        <Text as="p" fontSize="sm">
          {description}
        </Text>
      </Box>
    </RadioGroup.Item>
  )
}

export default function RoomTypeSelect({ onSelect }: Props) {
  const [value, setValue] = React.useState("jukebox")

  const handleChange = (details: { value: string }) => {
    setValue(details.value)
    onSelect(details.value as Room["type"])
  }

  return (
    <RadioGroup.Root
      name="roomType"
      value={value}
      onValueChange={handleChange}
    >
      <VStack
        alignContent="flex-start"
        justifyItems="flex-start"
        alignItems="flex-start"
        w="100%"
        gap={4}
      >
        <RoomTypeCard
          title="Jukebox"
          description="People can see what you're currently playing, chat, and add songs to your Spotify queue. Great for parties and other social gatherings where a single Spotify account is playing music."
          value="jukebox"
          checked={value === "jukebox"}
        />
        <RoomTypeCard
          title="Radio"
          description="Listen to a ShoutCast or IceCast radio station with your friends. See Spotify search results for what's currently playing. Great for listening to radio stations that don't have a web player."
          value="radio"
          checked={value === "radio"}
        />
      </VStack>
    </RadioGroup.Root>
  )
}
