import { Box, VStack, Text, Link as ChakraLink, Spacer, Button, ScrollArea } from "@chakra-ui/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { LayoutGrid, CalendarDays, LogOut } from "lucide-react"
import { authClient } from "@repo/auth/client"
import { ThemePreferenceControl } from "./ThemePreferenceControl"

const navItems = [
  { to: "/segments" as const, label: "Segments", icon: LayoutGrid },
  { to: "/shows" as const, label: "Shows", icon: CalendarDays },
]

export type NavSidebarContentProps = {
  /** Called after choosing a route or signing out (e.g. close mobile drawer). */
  onNavigate?: () => void
  /** Default true; set false in mobile drawer when the shell already shows the app title. */
  showTitle?: boolean
}

export function NavSidebarContent({ onNavigate, showTitle = true }: NavSidebarContentProps) {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  async function handleSignOut() {
    await authClient.signOut()
    onNavigate?.()
  }

  return (
    <Box display="flex" flexDirection="column" flex="1" minH={0} py={6} px={3} h="full">
      {showTitle ? (
        <Text fontSize="lg" fontWeight="bold" px={3} mb={6}>
          Scheduler
        </Text>
      ) : null}
      <VStack gap={1} align="stretch" flex="1" minH={0}>
        <ScrollArea.Root flex="1" minH={0}>
          <ScrollArea.Viewport>
            {navItems.map(({ to, label, icon: Icon }) => {
              const isActive = currentPath.startsWith(to)
              return (
                <ChakraLink asChild key={to}>
                  <Link
                    to={to}
                    onClick={() => onNavigate?.()}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      padding: "8px 12px",
                      borderRadius: "6px",
                      textDecoration: "none",
                      fontSize: "14px",
                      fontWeight: isActive ? 600 : 400,
                      background: isActive ? "var(--chakra-colors-bg-emphasized)" : "transparent",
                    }}
                  >
                    <Icon size={18} />
                    {label}
                  </Link>
                </ChakraLink>
              )
            })}
          </ScrollArea.Viewport>
        </ScrollArea.Root>
      </VStack>
      <Spacer />
      <Box px={3} mb={3}>
        <Text fontSize="xs" color="fg.muted" mb={1.5}>
          Theme
        </Text>
        <ThemePreferenceControl />
      </Box>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSignOut}
        justifyContent="flex-start"
        px={3}
        color="fg.muted"
      >
        <LogOut size={16} />
        Sign out
      </Button>
    </Box>
  )
}

/** Fixed left column for md+ viewports. */
export function NavSidebar() {
  return (
    <Box
      as="nav"
      w="220px"
      h="100vh"
      position="sticky"
      top={0}
      borderRightWidth="1px"
      borderColor="border.muted"
      display="flex"
      flexDirection="column"
    >
      <NavSidebarContent />
    </Box>
  )
}
