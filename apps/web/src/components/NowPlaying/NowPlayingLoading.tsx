import { Center, Spinner, VStack, Text } from "@chakra-ui/react"

interface NowPlayingLoadingProps {
  message?: string
}

export function NowPlayingLoading({ message }: NowPlayingLoadingProps) {
  return (
    <Center h="100%" w="100%">
      <VStack spacing={4}>
        <Spinner />
        {message && <Text>{message}</Text>}
      </VStack>
    </Center>
  )
}

