import { Flex } from "@chakra-ui/react"
import { ReactNode } from "react"

export function PageContent({ children }: { children: ReactNode }) {
  return (
    <Flex direction="column" position="relative" flex="1" p={{ base: 4, md: 6 }} minW={0} minH="0">
      {children}
    </Flex>
  )
}
