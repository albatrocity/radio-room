"use client"

import { ClientOnly, HStack, IconButton, Skeleton } from "@chakra-ui/react"
import { Monitor, Moon, Sun } from "lucide-react"
import { useColorMode, type ThemePreference } from "../ui/color-mode"

const options: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
]

function ThemePreferenceControlInner() {
  const { themePreference, setThemePreference } = useColorMode()

  return (
    <HStack gap={0} borderWidth="1px" borderColor="border.muted" borderRadius="md" p={0.5}>
      {options.map(({ value, label, icon: Icon }) => (
        <IconButton
          key={value}
          aria-label={`${label} theme`}
          aria-pressed={themePreference === value}
          variant={themePreference === value ? "solid" : "ghost"}
          size="xs"
          onClick={() => setThemePreference(value)}
        >
          <Icon size={16} />
        </IconButton>
      ))}
    </HStack>
  )
}

export function ThemePreferenceControl() {
  return (
    <ClientOnly fallback={<Skeleton height="8" width="full" maxW="108px" borderRadius="md" />}>
      <ThemePreferenceControlInner />
    </ClientOnly>
  )
}
