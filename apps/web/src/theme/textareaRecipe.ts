import { defineRecipe } from "@chakra-ui/react"

const iosSafeFieldSize = {
  textStyle: "md",
} as const

/** Extends Chakra’s textarea recipe so sm/md fields stay at 16px (no iOS focus zoom). */
export const textareaRecipe = defineRecipe({
  className: "chakra-textarea",
  variants: {
    size: {
      xs: iosSafeFieldSize,
      sm: iosSafeFieldSize,
      md: iosSafeFieldSize,
    },
  },
})
