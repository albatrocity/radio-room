import { Box, Flex } from "@chakra-ui/react"
import { NavSidebar } from "./NavSidebar"
import type { ReactNode } from "react"

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Flex minH="100vh">
      <NavSidebar />
      <Box flex="1" p={6} overflow="auto">
        {children}
      </Box>
    </Flex>
  )
}
