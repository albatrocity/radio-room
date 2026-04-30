import { defineSlotRecipe } from "@chakra-ui/react"

export const chatMessageRecipe = defineSlotRecipe({
  className: "chat-message",
  slots: ["root", "header", "username", "headerActions", "content", "messageBody", "floatingActions", "bookmarkIcon"],
  base: {
    root: {
      px: 3,
      py: 1,
      borderBottomColor: "secondaryBorder",
      background: "none",
      position: "relative",
      w: "100%",
    },
    header: {
      direction: "row",
      justify: "space-between",
      grow: 1,
      align: "center",
      w: "100%",
    },
    username: {
      my: "sm",
      fontWeight: 700,
    },
    headerActions: {},
    content: {
      gap: 1,
      align: "center",
      w: "100%",
    },
    messageBody: {
      w: "100%",
    },
    floatingActions: {
      p: 2,
      position: "absolute",
      top: 0,
      right: 2,
      borderRadius: 4,
      bg: "appBg",
    },
    bookmarkIcon: {
      fill: "none",
    },
  },
  variants: {
    isMention: {
      true: {
        root: {
          background: "primaryBg",
        },
      },
    },
    isBookmarked: {
      true: {
        bookmarkIcon: {
          fill: "currentColor",
        },
      },
    },
    hasBorder: {
      true: {
        root: {
          borderBottomWidth: 1,
        },
      },
      false: {
        root: {
          borderBottomWidth: 0,
        },
      },
    },
  },
  defaultVariants: {
    isMention: false,
    isBookmarked: false,
    hasBorder: true,
  },
})
