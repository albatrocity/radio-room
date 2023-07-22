import React from "react"
import {
  VStack,
  Box,
  useRadio,
  useRadioGroup,
  Text,
  HStack,
} from "@chakra-ui/react"
import { CheckIcon } from "@chakra-ui/icons"

import { Room } from "../../types/Room"

type Props = {
  onSelect: (type: Partial<Room["type"]>) => void
}

type RadioTypeCardProps = {
  title: string
  description: string
} & React.AriaAttributes &
  React.DOMAttributes<HTMLInputElement> & {
    id?: string | undefined
    role?: React.AriaRole | undefined
    tabIndex?: number | undefined
    style?: React.CSSProperties | undefined
  } & React.RefAttributes<any>

function RoomTypeCard(props: RadioTypeCardProps) {
  const { getInputProps, getCheckboxProps } = useRadio(props)
  const { title, description } = props

  const input = getInputProps()
  const checkbox = getCheckboxProps()

  return (
    <Box as="label" w="100%">
      <input {...input} />
      <Box
        {...checkbox}
        cursor="pointer"
        borderWidth="1px"
        borderRadius="md"
        boxShadow="sm"
        _checked={{
          bg: "primary.50",
          borderColor: "primary.600",
        }}
        _focus={{
          boxShadow: "outline",
        }}
        _dark={{
          _checked: {
            bg: "primary.600",
            borderColor: "primary.500",
          },
        }}
        px={5}
        py={3}
      >
        <HStack>
          <Text fontSize="lg" fontWeight={700}>
            {title}
          </Text>
          {input.checked && (
            <CheckIcon color="secondary.500" _dark={{ color: "primary.200" }} />
          )}
        </HStack>
        <Text as="p" fontSize="sm">
          {description}
        </Text>
      </Box>
    </Box>
  )
}

export default function RoomTypeSelect({ onSelect }: Props) {
  const { getRootProps, getRadioProps } = useRadioGroup({
    name: "roomType",
    defaultValue: "jukebox",
    onChange: onSelect,
  })

  const group = getRootProps()

  return (
    <VStack
      {...group}
      alignContent="flex-start"
      justifyItems="flex-start"
      alignItems="flex-start"
      w="100%"
      spacing={4}
    >
      <RoomTypeCard
        title="Jukebox"
        description="People can see what you're currently playing, chat, and add songs to your Spotify queue. Great for offices, parties, and other social gatherings where a single Spotify account is playing music."
        key="jukebox"
        {...getRadioProps({ value: "jukebox" })}
      />
      <RoomTypeCard
        title="Radio"
        description="Listen to a ShoutCast or IceCast radio station with your friends. See Spotify search results for what's currently playing. Great for listening to radio stations that don't have a web player."
        key="radio"
        {...getRadioProps({ value: "radio" })}
      />
    </VStack>
  )
}
