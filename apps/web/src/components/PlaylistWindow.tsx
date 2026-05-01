import React from "react"
import { Box, Button, Icon, ScrollArea, Separator, VStack } from "@chakra-ui/react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { LuArrowDown } from "react-icons/lu"
import { useStickToBottom } from "use-stick-to-bottom"
import { MetadataSourceType } from "@repo/types"
import { PlaylistItem } from "../types/PlaylistItem"
import SelectablePlaylistItem from "./SelectablePlaylistItem"

type Props = {
  playlist: PlaylistItem[]
  isSelectable: boolean
  selected?: PlaylistItem[]
  onSelect?: (item: PlaylistItem, isChecked: boolean) => void
  targetService?: MetadataSourceType
}

const PlaylistWindow = ({ playlist, isSelectable, selected, onSelect, targetService }: Props) => {
  const { scrollRef, contentRef, scrollToBottom, isAtBottom } = useStickToBottom({
    resize: "smooth",
    initial: "instant",
    damping: 0.8,
  })

  const virtualizer = useVirtualizer({
    count: playlist.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 88,
    overscan: 6,
    getItemKey: (index) => {
      const item = playlist[index]
      return item ? `${item.addedAt}-${item.track.id}` : index
    },
  })

  const handleJumpToBottom = () => {
    void scrollToBottom({ animation: "smooth", duration: 200 })
  }

  const virtualItems = virtualizer.getVirtualItems()
  const showJumpToBottom = !isAtBottom

  return (
    <Box position="relative" height="100%">
      <ScrollArea.Root height="100%" size="sm" variant="hover">
        <ScrollArea.Viewport ref={scrollRef} height="100%">
          <ScrollArea.Content>
            <Box
              ref={contentRef}
              position="relative"
              width="100%"
              height={`${virtualizer.getTotalSize()}px`}
            >
              {virtualItems.map((virtualRow) => {
                const item = playlist[virtualRow.index]
                if (!item) return null
                const isSelected = selected?.some((s) => s.track.id === item.track.id) ?? false

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
                    <VStack pb={2} gap={2} w="100%" align="stretch">
                      <SelectablePlaylistItem
                        item={item}
                        isSelectable={isSelectable}
                        isSelected={isSelected}
                        onSelect={onSelect}
                        targetService={targetService}
                      />
                      <Separator borderColor="secondaryBorder" w="100%" />
                    </VStack>
                  </Box>
                )
              })}
            </Box>
          </ScrollArea.Content>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar>
          <ScrollArea.Thumb />
        </ScrollArea.Scrollbar>
        <ScrollArea.Corner />
      </ScrollArea.Root>
      <Button
        position="absolute"
        bottom={2}
        right={2}
        zIndex={2}
        size="xs"
        variant="solid"
        colorPalette="secondary"
        opacity={0}
        pointerEvents="none"
        transition="opacity 0.2s"
        transitionDelay="0s"
        data-visible={showJumpToBottom || undefined}
        css={{
          "&[data-visible]": {
            opacity: 1,
            pointerEvents: "auto",
            transitionDelay: "0.5s",
          },
        }}
        onClick={handleJumpToBottom}
      >
        Latest
        <Icon as={LuArrowDown} boxSize={3} ml={1} />
      </Button>
    </Box>
  )
}

export default PlaylistWindow
