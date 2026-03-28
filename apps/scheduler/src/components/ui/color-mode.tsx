"use client"

import { ThemeProvider } from "next-themes"
import type { ThemeProviderProps } from "next-themes"

export type ColorModeProviderProps = ThemeProviderProps

export function ColorModeProvider(props: ColorModeProviderProps) {
  return <ThemeProvider attribute="class" disableTransitionOnChange defaultTheme="dark" {...props} />
}
