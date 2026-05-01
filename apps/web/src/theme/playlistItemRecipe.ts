import { defineSlotRecipe } from "@chakra-ui/react"

export const playlistItemRecipe = defineSlotRecipe({
  className: "playlist-item",
  slots: ["root", "trackInfo", "artwork", "trackDetails", "title", "artist", "metadata", "deleteButton"],
  base: {
    root: {
      justifyContent: "space-between",
      alignItems: "stretch",
      width: "100%",
      opacity: 1,
    },
    trackInfo: {},
    artwork: {
      w: 12,
      h: 12,
    },
    trackDetails: {
      gap: 0,
    },
    title: {
      fontWeight: "bold",
      textDecoration: "none",
      color: "colorPalette.fg",
    },
    artist: {
      textDecoration: "none",
      color: "colorPalette.fg/70",
    },
    metadata: {
      alignItems: "flex-end",
      gap: 0,
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
