import React, { useEffect, ReactNode } from "react"
import PropTypes from "prop-types"
import Div100vh from "react-div-100vh"

import "./layout.css"

import { useCurrentTheme } from "../hooks/useActors"
import { useCurrentArtworkUrl, useDynamicTheme } from "../hooks/useDynamicTheme"

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

  // On public pages, fall back to the original default theme when dynamic is
  // selected but there is no now-playing artwork to derive colors from.
  const effectiveTheme =
    dynamicFallbackToDefault && selectedTheme === "dynamic" && !artworkUrl
      ? "default"
      : selectedTheme

  // Set data-theme attribute for conditional semantic tokens
  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
  }, [effectiveTheme])

  // Extract and apply colors from album artwork when dynamic theme is selected
  useDynamicTheme()

  const Component = fill ? Div100vh : React.Fragment

  return <Component>{children}</Component>
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

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
