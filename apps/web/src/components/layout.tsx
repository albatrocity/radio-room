import React, { useEffect, ReactNode } from "react"
import PropTypes from "prop-types"
import Div100vh from "react-div-100vh"

import "./layout.css"

import { useCurrentTheme } from "../hooks/useActors"

const ThemedLayout = ({ children, fill }: { children: ReactNode; fill?: boolean }) => {
  const chosenThemeId = useCurrentTheme()

  // Set data-theme attribute for conditional semantic tokens
  useEffect(() => {
    document.documentElement.dataset.theme = chosenThemeId
  }, [chosenThemeId])

  const Component = fill ? Div100vh : React.Fragment

  return <Component>{children}</Component>
}

const Layout = ({ children, fill = false }: { children: ReactNode; fill?: boolean }) => {
  return <ThemedLayout fill={fill}>{children}</ThemedLayout>
}

Layout.propTypes = {
  children: PropTypes.node.isRequired,
}

export default Layout
