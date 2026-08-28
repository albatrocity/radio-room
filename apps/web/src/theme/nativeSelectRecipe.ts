import { defineSlotRecipe } from "@chakra-ui/react"
import { nativeSelectAnatomy } from "@chakra-ui/react/anatomy"

const iosSafeField = {
  textStyle: "md",
} as const

/** Extends Chakra’s native-select field so sm/md stay at 16px (no iOS focus zoom). */
export const nativeSelectRecipe = defineSlotRecipe({
  className: "chakra-native-select",
  slots: nativeSelectAnatomy.keys(),
  variants: {
    size: {
      xs: { field: iosSafeField },
      sm: { field: iosSafeField },
      md: { field: iosSafeField },
    },
  },
})
