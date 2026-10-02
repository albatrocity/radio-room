"use client"

import { Button, Heading, HStack, IconButton } from "@chakra-ui/react"
import { Map as MapIcon, Moon, Sparkles, Sun, Users } from "lucide-react"
import { studioPageHref, type StudioPage } from "../../hooks/useStudioPage"
import { useColorMode } from "../ui/color-mode"

const PAGES: { page: StudioPage; label: string; icon: typeof Users }[] = [
  { page: "sandbox", label: "Sandbox", icon: Users },
  { page: "trip-maps", label: "Trip maps", icon: MapIcon },
]

export function StudioHeader({ page }: { page: StudioPage }) {
  const { colorMode, toggleColorMode } = useColorMode()

  return (
    <HStack justify="space-between" gap="3" wrap="wrap">
      <HStack gap="4" wrap="wrap">
        <HStack gap="3">
          <Sparkles size={22} />
          <Heading size="lg">Game Studio</Heading>
        </HStack>
        <HStack as="nav" gap="1" aria-label="Studio pages">
          {PAGES.map(({ page: target, label, icon: Icon }) => (
            <Button
              key={target}
              asChild
              size="sm"
              variant={page === target ? "subtle" : "ghost"}
              aria-current={page === target ? "page" : undefined}
            >
              <a href={studioPageHref(target)}>
                <Icon size={16} /> {label}
              </a>
            </Button>
          ))}
        </HStack>
      </HStack>
      <IconButton
        variant="ghost"
        aria-label="Toggle color mode"
        onClick={toggleColorMode}
        title="Toggle theme"
      >
        {colorMode === "light" ? <Moon size={18} /> : <Sun size={18} />}
      </IconButton>
    </HStack>
  )
}
