import { Box, CloseButton, Drawer, Flex, Heading, IconButton } from "@chakra-ui/react"
import { useState } from "react"
import type { ReactNode } from "react"
import { Menu } from "lucide-react"
import { NavSidebar, NavSidebarContent } from "./NavSidebar"

export function AppLayout({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)

  return (
    <Flex minH="100vh" direction="column">
      <Flex
        display={{ base: "flex", md: "none" }}
        align="center"
        gap={3}
        px={4}
        py={3}
        borderBottomWidth="1px"
        borderColor="border.muted"
        flexShrink={0}
        position="sticky"
        bg="bg.panel"
        zIndex="docked"
        top={0}
      >
        <IconButton
          aria-label="Open menu"
          variant="ghost"
          size="sm"
          onClick={() => setNavOpen(true)}
        >
          <Menu size={20} />
        </IconButton>
        <Heading as="h1" size="md" fontWeight="semibold">
          Scheduler
        </Heading>
      </Flex>

      <Flex flex="1" minH={0} direction="row">
        <Box display={{ base: "none", md: "block" }} flexShrink={0}>
          <NavSidebar />
        </Box>
        <Box flex="1" p={{ base: 4, md: 6 }} overflow="auto" minW={0}>
          {children}
        </Box>
      </Flex>

      <Drawer.Root
        open={navOpen}
        onOpenChange={(e) => setNavOpen(e.open)}
        placement="start"
        size="xs"
      >
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content maxW="min(280px, 85vw)">
            <Drawer.Header borderBottomWidth="0" pb={0}>
              <Drawer.CloseTrigger asChild position="absolute" top={3} right={3}>
                <CloseButton size="sm" />
              </Drawer.CloseTrigger>
            </Drawer.Header>
            <Drawer.Body p={0} display="flex" flexDirection="column" minH="calc(100vh - 48px)">
              <NavSidebarContent showTitle={false} onNavigate={() => setNavOpen(false)} />
            </Drawer.Body>
          </Drawer.Content>
        </Drawer.Positioner>
      </Drawer.Root>
    </Flex>
  )
}
