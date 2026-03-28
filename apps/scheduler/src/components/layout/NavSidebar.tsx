import { Box, VStack, Text, Link as ChakraLink, Spacer, Button } from "@chakra-ui/react"
import { Link, useRouterState } from "@tanstack/react-router"
import { LayoutGrid, CalendarDays, LogOut } from "lucide-react"
import { authClient } from "@repo/auth/client"
import { ThemePreferenceControl } from "./ThemePreferenceControl"

const navItems = [
  { to: "/segments" as const, label: "Segments", icon: LayoutGrid },
  { to: "/shows" as const, label: "Shows", icon: CalendarDays },
]

export function NavSidebar() {
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  async function handleSignOut() {
    await authClient.signOut()
  }

  return (
    <Box
      as="nav"
      w="220px"
      minH="100vh"
      borderRightWidth="1px"
      borderColor="border.muted"
      py={6}
      px={3}
      display="flex"
      flexDirection="column"
    >
      <Text fontSize="lg" fontWeight="bold" px={3} mb={6}>
        Scheduler
      </Text>
      <VStack gap={1} align="stretch">
        {navItems.map(({ to, label, icon: Icon }) => {
          const isActive = currentPath.startsWith(to)
          return (
            <ChakraLink asChild key={to}>
              <Link
                to={to}
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
