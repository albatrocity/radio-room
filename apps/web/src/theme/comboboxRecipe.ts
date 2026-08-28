import { defineSlotRecipe } from "@chakra-ui/react"
import { comboboxAnatomy } from "@chakra-ui/react/anatomy"

/** iOS Safari zooms focused fields under 16px and often never zooms back out. */
const iosSafeInput = {
  textStyle: "md",
} as const

/**
 * Extends Chakra’s combobox input so xs/sm/md stay at 16px (no iOS focus zoom).
 */
export const comboboxRecipe = defineSlotRecipe({
  className: "chakra-combobox",
  slots: comboboxAnatomy.keys(),
  variants: {
    size: {
      xs: { input: iosSafeInput },
      sm: { input: iosSafeInput },
      md: { input: iosSafeInput },
    },
  },
})
