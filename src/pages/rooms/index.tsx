import React from "react"
import { Center, Spinner, VStack } from "@chakra-ui/react"
import Div100vh from "react-div-100vh"

type Props = {}

export default function RoomsPage({}: Props) {
  return (
    <Div100vh>
      <Center h="100%">
        <VStack spacing={4}>
          <Spinner size="lg" />
        </VStack>
      </Center>
    </Div100vh>
  )
}
