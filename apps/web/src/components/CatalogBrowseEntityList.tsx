import React, { useEffect, useRef } from "react"
import { Box, ScrollArea, Text } from "@chakra-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import ScrollShadowViewport from "./ScrollShadowViewport"
import VirtualizerContent, { virtualizerViewportCss } from "./VirtualizerContent"
import { virtualizerOverscan } from "../lib/virtualizerOverscan"

const ROW_ESTIMATE_PX = 64

type Props<T> = {
  items: T[]
  getId: (item: T) => string
  renderRow: (item: T) => React.ReactNode
  emptyMessage: string
  fillHeight?: boolean
  hasMore?: boolean
  loadingMore?: boolean
  onLoadMore?: () => void
}

/**
 * Virtualized root catalog list (Artists / Albums). Loads the next page when
 * the last painted row approaches the end of the accumulated list.
 */
function CatalogBrowseEntityList<T>({
  items,
  getId,
  renderRow,
  emptyMessage,
  fillHeight = false,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: Props<T>) {
  const scrollRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_ESTIMATE_PX,
    overscan: virtualizerOverscan(6, 12),
    getItemKey: (index) => {
      const item = items[index]
      return item ? getId(item) : index
    },
  })

  const lastIndex = virtualizer.getVirtualItems().at(-1)?.index

  useEffect(() => {
    if (lastIndex == null || !hasMore || loadingMore || !onLoadMore || items.length === 0) {
      return
    }
    if (lastIndex >= items.length - 1) {
      onLoadMore()
    }
  }, [lastIndex, hasMore, loadingMore, onLoadMore, items.length])

  if (items.length === 0) {
    return (
      <Text fontSize="sm" color="fg.muted" py={2}>
        {emptyMessage}
      </Text>
    )
  }

  const virtualItems = virtualizer.getVirtualItems()

  return (
    <ScrollArea.Root
      size="sm"
      variant="hover"
      w="100%"
      {...(fillHeight ? { flex: "1 1 auto", minH: 0, height: "100%" } : { maxH: "320px" })}
    >
      <ScrollShadowViewport
        ref={scrollRef}
        {...(fillHeight ? { height: "100%" } : {})}
        css={virtualizerViewportCss}
      >
        <ScrollArea.Content>
          <VirtualizerContent totalSize={virtualizer.getTotalSize()}>
            {virtualItems.map((virtualRow) => {
              const item = items[virtualRow.index]
              if (!item) return null
              return (
                <Box
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={virtualizer.measureElement}
                  position="absolute"
                  top={0}
                  left={0}
                  width="100%"
                  transform={`translateY(${virtualRow.start}px)`}
                >
                  {renderRow(item)}
                </Box>
              )
            })}
          </VirtualizerContent>
        </ScrollArea.Content>
      </ScrollShadowViewport>
      <ScrollArea.Scrollbar>
        <ScrollArea.Thumb />
      </ScrollArea.Scrollbar>
      <ScrollArea.Corner />
    </ScrollArea.Root>
  )
}

export default CatalogBrowseEntityList
