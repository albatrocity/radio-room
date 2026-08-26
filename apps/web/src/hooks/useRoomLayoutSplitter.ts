import { useCallback, useMemo, useRef, useState } from "react"
import { useSplitter } from "@chakra-ui/react"
import { useSelector } from "@xstate/react"

import { roomLayoutActor, resetRoomLayout } from "../actors/roomLayoutActor"
import {
  type RoomLayoutKey,
  buildSplitterPanels,
  getDefaultLayout,
} from "../lib/roomLayoutStorage"
import { useActiveIntegratedPanelSlot } from "./useIntegratedPanelPresentation"

export function useRoomLayoutSplitter() {
  const panelOpen = useActiveIntegratedPanelSlot() !== null
  const layoutKey: RoomLayoutKey = panelOpen ? "4" : "3"
  const persistedSizes = useSelector(roomLayoutActor, (s) =>
    layoutKey === "4" ? s.context.layout4 : s.context.layout3,
  )

  const [liveSizes, setLiveSizes] = useState(persistedSizes)
  const prevLayoutKeyRef = useRef(layoutKey)

  // Apply cached layout sizes immediately when the integrated panel opens/closes.
  if (prevLayoutKeyRef.current !== layoutKey) {
    prevLayoutKeyRef.current = layoutKey
    setLiveSizes(persistedSizes)
  }

  const panels = useMemo(() => buildSplitterPanels(layoutKey), [layoutKey])

  const handleResizeEnd = useCallback(
    ({ size }: { size: number[] }) => {
      roomLayoutActor.send({ type: "RESIZE_END", layout: layoutKey, sizes: size })
    },
    [layoutKey],
  )

  const splitter = useSplitter({
    panels,
    size: liveSizes,
    onResize: ({ size }) => setLiveSizes(size),
    onResizeEnd: handleResizeEnd,
  })

  const resetLayout = useCallback(() => {
    const defaults = getDefaultLayout(layoutKey)
    resetRoomLayout(layoutKey)
    setLiveSizes(defaults)
  }, [layoutKey])

  return { splitter, layoutKey, panelOpen, resetLayout }
}

export function useRoomLayoutSizes(layoutKey: RoomLayoutKey) {
  return useSelector(roomLayoutActor, (s) =>
    layoutKey === "4" ? s.context.layout4 : s.context.layout3,
  )
}
