import React, { useContext } from "react"
import { Box, ThemeContext } from "grommet"

const Spinning = ({ fill }) => (
  <svg version="1.1" viewBox="0 0 32 32" width="28px" height="28px" fill={fill}>
    <path
      opacity=".25"
      d="M16 0 A16 16 0 0 0 16 32 A16 16 0 0 0 16 0 M16 4 A12 12 0 0 1 16 28 A12 12 0 0 1 16 4"
    />
    <path d="M16 0 A16 16 0 0 1 32 16 L28 16 A12 12 0 0 0 16 4z">
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0 16 16"
        to="360 16 16"
        dur="0.8s"
        repeatCount="indefinite"
      />
    </path>
  </svg>
)

export const Spinner = () => {
  const {
    global: { colors },
  } = useContext(ThemeContext)
  return (
    <Box align="center" justify="center">
      <Spinning fill={colors["dark-3"]} />
    </Box>
  )
}

export default Spinner
