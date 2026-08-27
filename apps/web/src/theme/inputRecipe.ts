import { defineRecipe } from "@chakra-ui/react"

/** iOS Safari zooms focused fields under 16px and often never zooms back out. */
const iosSafeFieldSize = {
  textStyle: "md",
} as const

/**
 * Extends Chakra’s input recipe so sm/md (and smaller) fields stay at 16px.
 */
export const inputRecipe = defineRecipe({
  className: "chakra-input",
  variants: {
    size: {
      "2xs": iosSafeFieldSize,
      xs: iosSafeFieldSize,
      sm: iosSafeFieldSize,
      md: iosSafeFieldSize,
    },
  },
})
