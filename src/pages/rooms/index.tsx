import React, { useEffect } from "react"
import { Center, Spinner, VStack } from "@chakra-ui/react"
import Div100vh from "react-div-100vh"
import { navigate } from "gatsby"

type Props = {}

export default function RoomsIndexPage({}: Props) {
  useEffect(() => {
    navigate("/")
  }, [])

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
