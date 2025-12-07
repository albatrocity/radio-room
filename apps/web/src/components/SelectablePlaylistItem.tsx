import { Checkbox as ChakraCheckbox, HStack, Box } from "@chakra-ui/react"
import React, { memo, useCallback, useMemo } from "react"
import { MetadataSourceType } from "@repo/types"
import { Tooltip } from "./ui/tooltip"
import { PlaylistItem as Item } from "../types/PlaylistItem"
import PlaylistItem from "./PlaylistItem"
import { serviceConfig } from "./ServiceSelect"

interface Props {
  item: Item
  isSelectable?: boolean
  isSelected?: boolean
  onSelect?: (item: Item, isChecked: boolean) => void
  targetService?: MetadataSourceType
}

/**
 * Check if a track is available for a given service
 */
function isTrackAvailableForService(item: Item, service?: MetadataSourceType): boolean {
  if (!service) return true

  // Check if we have metadata for this service
  const sourceData = item.metadataSources?.[service]
  if (sourceData?.source?.trackId) return true

  // Fallback: if target is spotify and we have a mediaSource with spotify type
  if (service === "spotify" && item.mediaSource?.type === "spotify") {
    return true
  }

  return false
}

const SelectablePlaylistItem = memo(function SelectablePlaylistItem({
  item,
  isSelectable = false,
  isSelected = false,
  onSelect,
  targetService,
}: Props) {
  const isAvailable = useMemo(
    () => isTrackAvailableForService(item, targetService),
    [item, targetService],
  )

  const handleChange = useCallback(
    (details: { checked: boolean | "indeterminate" }) => {
      if (!isAvailable) return // Don't allow selection of unavailable tracks
      onSelect?.(item, details.checked === true)
    },
    [onSelect, item, isAvailable],
  )

  const serviceName = targetService ? serviceConfig[targetService]?.label || targetService : ""

  // When in selection mode and track is unavailable, show disabled state with tooltip
  if (isSelectable && !isAvailable) {
    return (
      <Tooltip content={`Not available on ${serviceName}`}>
        <HStack opacity={0.5} cursor="not-allowed">
          <ChakraCheckbox.Root checked={false} disabled>
            <ChakraCheckbox.HiddenInput />
            <ChakraCheckbox.Control />
          </ChakraCheckbox.Root>
          <Box flex={1}>
            <PlaylistItem item={item} />
          </Box>
        </HStack>
      </Tooltip>
    )
  }

  return (
    <HStack>
      {isSelectable && (
        <ChakraCheckbox.Root checked={isSelected} onCheckedChange={handleChange}>
          <ChakraCheckbox.HiddenInput />
          <ChakraCheckbox.Control />
        </ChakraCheckbox.Root>
      )}
      <Box flex={1}>
        <PlaylistItem item={item} />
      </Box>
    </HStack>
  )
})

export default SelectablePlaylistItem
