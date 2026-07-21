import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { useMachine } from "@xstate/react"
import {
  Box,
  Button,
  Center,
  Input,
  ScrollArea,
  Spinner,
  Tabs,
  Text,
  VStack,
} from "@chakra-ui/react"

import { useSocketMachine } from "../hooks/useSocketMachine"
import { trackSearchMachine } from "../machines/trackSearchMachine"
import { createDebouncedInputMachine } from "../machines/debouncedInputMachine"
import { useCurrentRoom } from "../hooks/useActors"
import { MetadataSourceTrack } from "@repo/types"
import TrackItem from "./TrackItem"

type TrackWithSource = MetadataSourceTrack & { source?: string }

const SOURCE_TAB_LABELS: Record<string, string> = {
  spotify: "Spotify",
  tidal: "Tidal",
  youtube: "YouTube",
  local: "Library",
}

function sourceTabLabel(sourceId: string): string {
  return SOURCE_TAB_LABELS[sourceId] ?? sourceId.charAt(0).toUpperCase() + sourceId.slice(1)
}

type Props = {
  onChoose: (item: MetadataSourceTrack) => void
  /** True while the search input has a non-empty query (for dimming sibling UI). */
  onSearchActiveChange?: (isActive: boolean) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

function TrackSearch({
  onChoose,
  onSearchActiveChange,
  placeholder = "Search for a track",
  disabled = false,
  autoFocus = true,
}: Props) {
  const listboxId = useId()
  const room = useCurrentRoom()
  const [state, send] = useSocketMachine(trackSearchMachine)
  const [sourceFilter, setSourceFilter] = useState<string>("all")
  const [activeIndex, setActiveIndex] = useState(-1)
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([])

  const handleSearchChange = useCallback(
    (value: string) => {
      if (value && value !== "") {
        send({ type: "FETCH_RESULTS", value })
      }
    },
    [send],
  )

  const debounceMachine = useMemo(
    () => createDebouncedInputMachine(handleSearchChange),
    [handleSearchChange],
  )

  const [inputState, inputSend] = useMachine(debounceMachine)
  const searchValue = inputState.context.value ?? ""
  const hasQuery = searchValue.trim() !== ""

  const metadataSourceIds = useMemo(
    () => (room?.metadataSourceIds ?? []).filter(Boolean),
    [room?.metadataSourceIds],
  )
  const showSourceTabs = metadataSourceIds.length >= 2

  useEffect(() => {
    if (sourceFilter === "all") return
    if (!showSourceTabs || !metadataSourceIds.includes(sourceFilter)) {
      setSourceFilter("all")
    }
  }, [metadataSourceIds, showSourceTabs, sourceFilter])

  const results = state.context.results as TrackWithSource[]
  const filteredResults = useMemo(() => {
    if (sourceFilter === "all") return results
    return results.filter((track) => track.source === sourceFilter)
  }, [results, sourceFilter])

  useEffect(() => {
    onSearchActiveChange?.(hasQuery)
  }, [hasQuery, onSearchActiveChange])

  useEffect(() => {
    setActiveIndex(-1)
  }, [sourceFilter, results])

  useEffect(() => {
    if (activeIndex < 0) return
    optionRefs.current[activeIndex]?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  const chooseTrack = useCallback(
    (track: TrackWithSource) => {
      onChoose(track)
      setActiveIndex(-1)
    },
    [onChoose],
  )

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return

    if (event.key === "ArrowDown") {
      if (!hasQuery || filteredResults.length === 0) return
      event.preventDefault()
      setActiveIndex((prev) => (prev < filteredResults.length - 1 ? prev + 1 : 0))
      return
    }

    if (event.key === "ArrowUp") {
      if (!hasQuery || filteredResults.length === 0) return
      event.preventDefault()
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredResults.length - 1))
      return
    }

    if (event.key === "Enter") {
      if (activeIndex < 0 || activeIndex >= filteredResults.length) return
      event.preventDefault()
      const track = filteredResults[activeIndex]
      if (track) chooseTrack(track)
      return
    }

    if (event.key === "Escape") {
      if (activeIndex >= 0) {
        event.preventDefault()
        event.stopPropagation()
        setActiveIndex(-1)
      }
    }
  }

  const isLoading = state.matches("loading")
  const showResults = hasQuery
  const activeOptionId =
    activeIndex >= 0 && filteredResults[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined

  return (
    <VStack align="stretch" gap={3} w="100%">
      {state.matches("failure") && (
        <Text color="red.500" fontSize="sm">
          {state.context.error?.message ?? "Search failed"}
        </Text>
      )}

      <Input
        placeholder={placeholder}
        value={searchValue}
        disabled={disabled}
        autoFocus={autoFocus}
        onChange={(e) => inputSend({ type: "SET_VALUE", value: e.target.value })}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        autoComplete="off"
      />

      {showSourceTabs && (
        <Tabs.Root
          value={sourceFilter}
          onValueChange={(details) => setSourceFilter(details.value)}
          variant="line"
          colorPalette="action"
          size="sm"
        >
          <Tabs.List flexWrap="wrap">
            <Tabs.Trigger value="all">All</Tabs.Trigger>
            {metadataSourceIds.map((sourceId) => (
              <Tabs.Trigger key={sourceId} value={sourceId}>
                {sourceTabLabel(sourceId)}
              </Tabs.Trigger>
            ))}
          </Tabs.List>
        </Tabs.Root>
      )}

      {showResults && (
        <Box>
          {isLoading && filteredResults.length === 0 ? (
            <Center py={6}>
              <Spinner size="sm" />
            </Center>
          ) : filteredResults.length === 0 && !isLoading ? (
            <Text fontSize="sm" color="fg.muted" py={2}>
              No tracks found{sourceFilter !== "all" ? ` in ${sourceTabLabel(sourceFilter)}` : ""}.
            </Text>
          ) : (
            <ScrollArea.Root maxH="320px" size="sm" variant="hover" w="100%">
              <ScrollArea.Viewport>
                <ScrollArea.Content>
                  <VStack
                    id={listboxId}
                    role="listbox"
                    aria-label="Search results"
                    align="stretch"
                    gap={0}
                    w="100%"
                  >
                    {filteredResults.map((track, index) => {
                      const isActive = index === activeIndex
                      return (
                        <Button
                          key={`${track.source ?? "unknown"}-${track.id}-${index}`}
                          ref={(el: HTMLButtonElement | null) => {
                            optionRefs.current[index] = el
                          }}
                          id={`${listboxId}-option-${index}`}
                          role="option"
                          aria-selected={isActive}
                          type="button"
                          variant="ghost"
                          disabled={disabled}
                          justifyContent="flex-start"
                          h="auto"
                          w="100%"
                          minW={0}
                          overflow="hidden"
                          p={2}
                          textAlign="left"
                          borderRadius="md"
                          bg={isActive ? "actionBgLite" : "transparent"}
                          _hover={{ bg: "actionBgLite" }}
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => chooseTrack(track)}
                        >
                          <TrackItem {...track} />
                        </Button>
                      )
                    })}
                  </VStack>
                </ScrollArea.Content>
              </ScrollArea.Viewport>
              <ScrollArea.Scrollbar>
                <ScrollArea.Thumb />
              </ScrollArea.Scrollbar>
              <ScrollArea.Corner />
            </ScrollArea.Root>
          )}
          {isLoading && filteredResults.length > 0 && (
            <Center py={2}>
              <Spinner size="xs" />
            </Center>
          )}
        </Box>
      )}
    </VStack>
  )
}

export default TrackSearch
