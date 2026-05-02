import { defineSlotRecipe } from "@chakra-ui/react"

export const listItemUserRecipe = defineSlotRecipe({
  className: "list-item-user",
  slots: [
    "root",
    "typingIndicator",
    "typingIcon",
    "content",
    "row",
    "leftGroup",
    "username",
    "actions",
  ],
  base: {
    root: {
      flexDirection: "row",
      display: "flex",
      alignItems: "center",
      background: "transparent",
    },
    typingIndicator: {
      opacity: 0,
      transition: "opacity 0.6s ease-in-out",
      background: "secondaryBg",
      zIndex: -1,
    },
    typingIcon: {
      transform: "scaleX(-1)",
      left: "-10px",
    },
    content: {
      gap: 1,
      alignItems: "flex-start",
      width: "100%",
    },
    row: {
      alignItems: "center",
      borderBottomWidth: "1px",
      gap: "0.4rem",
      py: 0,
      width: "100%",
      justifyContent: "space-between",
    },
    leftGroup: {
      gap: "0.4rem",
      justifyContent: "flex-start",
    },
    username: {
      fontWeight: 500,
      fontSize: "sm",
    },
    actions: {
      gap: "0.4rem",
    },
  },
  variants: {
    isDj: {
      true: {
        root: {
          background: "primaryBg",
        },
        row: {
          py: 2,
        },
        username: {
          fontWeight: 700,
        },
      },
    },
    isTyping: {
      true: {
        typingIndicator: {
          opacity: 1,
          zIndex: 1,
        },
        typingIcon: {
          animation: "pulse 0.8s infinite ease-in-out",
        },
      },
    },
  },
  defaultVariants: {
    isDj: false,
    isTyping: false,
  },
})
