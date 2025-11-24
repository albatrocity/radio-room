import { defineStyle, defineStyleConfig } from "@chakra-ui/react"
import { mode, transparentize } from "@chakra-ui/theme-tools"

const reaction = defineStyle((props) => {
  const { colorScheme: c, theme } = props
  const isActive = props["data-active"] === true
  const onDarkBg = props["data-dark-bg"] === true

  const darkBg = transparentize(`${c}.200`, 0.1)(theme)
  const darkHoverBg = transparentize(`${c}.500`, 0.3)(theme)

  const activeBorderColors = onDarkBg
    ? mode(
        transparentize(`${c}.400`, 0.6),
        transparentize(`${c}.200`, 0.6),
      )(props)
    : mode(
        transparentize(`${c}.500`, 0.5),
        transparentize(`${c}.800`, 1),
      )(props)

  const darkBgInactiveBgs = mode(
    transparentize(`${c}.900`, 0.2),
    transparentize(`${c}.800`, 1),
  )(props)

  const darkBgActiveBgs = mode(
    transparentize(`${c}.800`, 0.5),
    transparentize(`${c}.900`, 0.7),
  )(props)

  const inactiveBgs = onDarkBg
    ? darkBgInactiveBgs
    : mode(transparentize(`${c}.500`, 0.1), darkBg)(props)

  const activeBgs = onDarkBg
    ? darkBgActiveBgs
    : mode(
        transparentize(`${c}.500`, 0.3),
        transparentize(`${c}.800`, 0.6),
      )(props)

  const hoverColors = onDarkBg
    ? mode(
        transparentize(`${c}.800`, 1),
        transparentize(`${c}.900`, 0.7),
      )(props)
    : mode(transparentize(`${c}.500`, 0.2), darkHoverBg)(props)

  return {
    borderColor: isActive ? activeBorderColors : "transparent",
    bg: isActive ? activeBgs : inactiveBgs,
    color: mode(`${c}.600`, `${c}.300`)(props),
    _hover: {
      bg: hoverColors,
    },
  }
})

const darkGhost = defineStyle((props) => {
  const { colorScheme: c, theme } = props

  const darkHoverBg = transparentize(`${c}.200`, 0.12)(theme)
  const darkActiveBg = transparentize(`${c}.200`, 0.24)(theme)

  return {
    color: mode(`${c}.100`, `${c}.200`)(props),
    bg: "transparent",
    _hover: {
      bg: mode(`${c}.700`, darkHoverBg)(props),
    },
    _active: {
      bg: mode(`${c}.800`, darkActiveBg)(props),
    },
  }
})

const settingsCategory = defineStyle((props) => {
  return {
    bg: "secondaryBg",
    borderRadius: "lg",
    width: "100%",
    textAlign: "left",
    fontWeight: "400",
    justifyContent: "space-between",
  }
})

export const buttonTheme = defineStyleConfig({
  variants: { reaction, darkGhost, settingsCategory },
})

