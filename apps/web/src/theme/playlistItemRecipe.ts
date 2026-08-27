import { defineSlotRecipe } from "@chakra-ui/react"

export const playlistItemRecipe = defineSlotRecipe({
  className: "playlist-item",
  slots: [
    "root",
    "trackInfo",
    "artwork",
    "trackDetails",
    "title",
    "artist",
    "metadata",
    "metaText",
    "addedByLabel",
    "deleteButton",
  ],
  base: {
    root: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
      minW: 0,
      gap: 2,
      opacity: 1,
    },
    trackInfo: {
      flex: 1,
      minW: 0,
    },
    artwork: {
      w: 12,
      h: 12,
      minW: 12,
      flexShrink: 0,
      overflow: "hidden",
      borderRadius: "sm",
    },
    trackDetails: {
      gap: 0,
      flex: 1,
      minW: 0,
      overflow: "hidden",
    },
    title: {
      fontWeight: "bold",
      textDecoration: "none",
      color: "colorPalette.fg",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    artist: {
      textDecoration: "none",
      color: "colorPalette.fg/70",
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    metadata: {
      alignItems: "center",
      flexShrink: 0,
      gap: 1,
      flexWrap: "nowrap",
    },
    metaText: {
      flexDirection: "column",
      alignItems: "flex-end",
      justifyContent: "center",
      gap: "0.125rem",
      minW: 0,
    },
    addedByLabel: {
      "@container playlist-item (max-width: 30rem)": {
        display: "none",
      },
    },
    deleteButton: {
      opacity: 0,
      transition: "opacity 0.2s ease-in-out",
    },
  },
  variants: {
    isSkipped: {
      true: {
        root: {
          opacity: 0.6,
        },
        title: {
          textDecoration: "line-through",
          color: "colorPalette.fg/70",
        },
        artist: {
          textDecoration: "line-through",
          color: "colorPalette.fg/40",
        },
      },
    },
    isHovered: {
      true: {
        deleteButton: {
          opacity: 1,
        },
      },
    },
  },
  defaultVariants: {
    isSkipped: false,
    isHovered: false,
  },
})
