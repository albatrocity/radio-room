import { Flex } from "@chakra-ui/react"
import { ReactNode } from "react"
import { PageContent } from "./PageContent"

export function ManagedOverflowContainer({ children }: { children: ReactNode }) {
  return (
    <Flex
      className="managed-overflow-container"
      direction="column"
      minW={0}
      minH="0"
      h="100vh"
      overflow="hidden"
    >
      <PageContent>{children}</PageContent>
    </Flex>
  )
}
