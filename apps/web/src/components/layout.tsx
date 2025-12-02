import React, { useEffect } from "react"
import PropTypes from "prop-types"
import Div100vh from "react-div-100vh"

import "./layout.css"
import themes from "../themes"

import { useCurrentTheme } from "../state/themeStore"
import { useErrorsStore } from "../state/errorsStore"

const ThemedLayout = ({ children, fill }: { children: JSX.Element; fill?: boolean }) => {
  const chosenThemeId = useCurrentTheme()
  const chosenTheme = themes[chosenThemeId] ?? {}
  useErrorsStore()

  // Apply theme colors as CSS variables for dynamic theming
  useEffect(() => {
    if (chosenTheme.colors) {
      const root = document.documentElement
      Object.entries(chosenTheme.colors).forEach(([colorName, shades]) => {
        if (typeof shades === "object") {
          Object.entries(shades as Record<string, string>).forEach(([shade, value]) => {
            root.style.setProperty(`--chakra-colors-${colorName}-${shade}`, value)
          })
        }
      })
    }
  }, [chosenTheme])

  const Component = fill ? Div100vh : React.Fragment

  return <Component>{children}</Component>
}

const Layout = ({ children, fill = false }: { children: JSX.Element; fill?: boolean }) => {
  return <ThemedLayout fill={fill}>{children}</ThemedLayout>
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
