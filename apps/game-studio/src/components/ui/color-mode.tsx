"use client"

import { ThemeProvider, useTheme } from "next-themes"
import type { ThemeProviderProps } from "next-themes"

export type ColorModeProviderProps = ThemeProviderProps

export function ColorModeProvider(props: ColorModeProviderProps) {
  return (
    <ThemeProvider
      attribute="class"
      disableTransitionOnChange
      defaultTheme="dark"
      enableSystem
      storageKey="game-studio-theme"
      {...props}
    />
  )
}

export type ThemePreference = "light" | "dark" | "system"

export function useColorMode() {
  const { theme, setTheme, resolvedTheme } = useTheme()

  const themePreference: ThemePreference =
    theme === "light" || theme === "dark" || theme === "system" ? theme : "dark"

  const colorMode = resolvedTheme === "light" ? "light" : "dark"

  const toggleColorMode = () => {
    setTheme(resolvedTheme === "light" ? "dark" : "light")
  }

  return {
    colorMode,
    themePreference,
    setThemePreference: (value: ThemePreference) => setTheme(value),
    toggleColorMode,
  }
}
