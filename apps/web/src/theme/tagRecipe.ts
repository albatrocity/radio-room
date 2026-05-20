import { defineSlotRecipe } from "@chakra-ui/react"

/** Extends the default Chakra tag recipe with a compact `xs` size. */
export const tagRecipe = defineSlotRecipe({
  className: "chakra-tag",
  slots: ["root", "label", "closeTrigger", "startElement", "endElement"],
  variants: {
    size: {
      xs: {
        root: {
          px: "1",
          minH: "3.5",
          gap: "0.5",
          "--tag-avatar-size": "spacing.2.5",
          "--tag-element-size": "spacing.2.5",
          "--tag-element-offset": "-1px",
        },
        label: {
          fontSize: "2xs",
          lineHeight: "1.2",
        },
      },
    },
  },
})
