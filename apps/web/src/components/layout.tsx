import { ReactNode, useLayoutEffect } from "react"

import { Box } from "@chakra-ui/react"

import "./layout.css"

import { useCurrentTheme } from "../hooks/useActors"
import { useCurrentArtworkUrl, useDynamicPalette, useDynamicTheme } from "../hooks/useDynamicTheme"
import { useColorMode } from "./ui/color-mode"
import { syncBrowserThemeColorFromCss } from "../lib/browserThemeColor"

const ThemedLayout = ({
  children,
  fill,
  dynamicFallbackToDefault = false,
}: {
  children: ReactNode
  fill?: boolean
  dynamicFallbackToDefault?: boolean
}) => {
  const selectedTheme = useCurrentTheme()
  const artworkUrl = useCurrentArtworkUrl()
  const { colorMode } = useColorMode()
  const dynamicPalette = useDynamicPalette()

  // On public pages, fall back to the original default theme when dynamic is
  // selected but there is no now-playing artwork to derive colors from.
  const effectiveTheme =
    dynamicFallbackToDefault && selectedTheme === "dynamic" && !artworkUrl
      ? "default"
      : selectedTheme

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
    syncBrowserThemeColorFromCss()
  }, [effectiveTheme, colorMode, dynamicPalette])

  // Extract and apply colors from album artwork when dynamic theme is selected
  useDynamicTheme()

  if (fill) {
    return <Box className="app-shell">{children}</Box>
  }

  return <>{children}</>
}

const Layout = ({
  children,
  fill = false,
  dynamicFallbackToDefault = false,
}: {
  children: ReactNode
  fill?: boolean
  dynamicFallbackToDefault?: boolean
}) => {
  return (
    <ThemedLayout fill={fill} dynamicFallbackToDefault={dynamicFallbackToDefault}>
      {children}
    </ThemedLayout>
  )
}

export default Layout
