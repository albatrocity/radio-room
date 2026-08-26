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
    "usernameWrap",
    "username",
    "actions",
  ],
  base: {
    root: {
      flexDirection: "row",
      display: "flex",
      alignItems: "center",
      background: "transparent",
      minW: 0,
      width: "100%",
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
      minW: 0,
      flex: 1,
    },
    row: {
      alignItems: "center",
      borderBottomWidth: "1px",
      gap: "0.4rem",
      py: 0,
      width: "100%",
    },
    leftGroup: {
      gap: "0.4rem",
      justifyContent: "flex-start",
      flex: 1,
      minW: 0,
      overflow: "hidden",
    },
    usernameWrap: {
      flex: 1,
      minW: 0,
      overflow: "hidden",
    },
    username: {
      fontWeight: 500,
      fontSize: "sm",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
      minW: 0,
    },
    actions: {
      gap: "0.4rem",
      flexShrink: 0,
      marginLeft: "auto",
      justifyContent: "flex-end",
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
