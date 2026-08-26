/** Popover props for triggers inside scroll containers (integrated panel, modals). */
export const popoverInScrollContainer = {
  autoFocus: false as const,
  portalled: false as const,
  positioning: {
    strategy: "fixed" as const,
    placement: "top-start" as const,
    flip: true,
    slide: true,
    fitViewport: true,
    overflowPadding: 8,
  },
}
