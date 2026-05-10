import { Box, CloseButton, Drawer, Flex, Heading, IconButton } from "@chakra-ui/react"
import { useLayoutEffect, useRef, useState } from "react"
import type { ReactNode } from "react"
import { Menu } from "lucide-react"
import { NavSidebar, NavSidebarContent } from "./NavSidebar"
import { SchedulerLayoutProvider, SCHEDULER_MD_MIN_WIDTH_MEDIA } from "./SchedulerLayoutContext"

export function AppLayout({ children }: { children: ReactNode }) {
  const [navOpen, setNavOpen] = useState(false)
  const [mobileHeaderOuterHeightPx, setMobileHeaderOuterHeightPx] = useState(0)
  const mobileHeaderRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const headerEl = mobileHeaderRef.current
    if (!headerEl) return

    const media = window.matchMedia(SCHEDULER_MD_MIN_WIDTH_MEDIA)

    function sync() {
      if (media.matches) {
        setMobileHeaderOuterHeightPx(0)
        return
      }
      const node = mobileHeaderRef.current
      if (!node) return
      setMobileHeaderOuterHeightPx(node.offsetHeight)
    }

    const ro = new ResizeObserver(sync)
    ro.observe(headerEl)
    media.addEventListener("change", sync)
    sync()

    return () => {
      ro.disconnect()
      media.removeEventListener("change", sync)
    }
  }, [])

  return (
    <SchedulerLayoutProvider value={{ mobileHeaderOuterHeightPx }}>
      <Flex minH="100vh" direction="column">
        <Flex
          ref={mobileHeaderRef}
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
          <Flex direction="column" flex="1" minW={0} minH="0">
            {children}
          </Flex>
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
    </SchedulerLayoutProvider>
  )
}
