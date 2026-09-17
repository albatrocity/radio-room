import { useState } from "react"
import { Badge, Box, Popover, Text, VStack } from "@chakra-ui/react"
import type { ItemDefinition } from "@repo/types"
import {
  artifactKindBadge,
  artifactSummaryLabel,
  isStashPickable,
  readArtifactContents,
} from "@repo/game-logic"
import { refreshStoredArtifacts } from "../../../actors/userGameStateActor"
import { useStoredArtifacts } from "../../../hooks/useActors"
import { containerDisplayName, formatStashLastTouched } from "./stashUi"

/**
 * Choose a stored artifact to target for lock-picking items.
 * Parent handles socket emit after `onPick(artifactId)`.
 */
export function InventoryUseStashTargetPicker({
  children,
  definitionMap,
  onPick,
}: {
  children: React.ReactNode
  definitionMap: Map<string, ItemDefinition>
  onPick: (targetArtifactId: string) => void
}) {
  const artifacts = useStoredArtifacts()
  const [open, setOpen] = useState(false)
  const now = Date.now()

  const pickable = artifacts.filter((a) => isStashPickable(a, now))

  const choose = (artifactId: string) => {
    setOpen(false)
    onPick(artifactId)
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => {
        setOpen(e.open)
        if (e.open) refreshStoredArtifacts()
      }}
      lazyMount
      portalled={false}
      positioning={{ placement: "bottom-end", strategy: "fixed" }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content
          css={{ "--popover-bg": "{colors.appBg}" }}
          minW="min(360px, 92vw)"
          maxW="92vw"
          maxH="min(360px, 60vh)"
          overflowY="auto"
          p={2}
        >
          {pickable.length === 0 ? (
            <Text fontSize="xs" color="fg.muted" px={1}>
              No stash has sat untouched long enough. Come back in a couple of months.
            </Text>
          ) : (
            <VStack align="stretch" gap={2}>
              {pickable.map((a) => {
                const contents = readArtifactContents(a)
                const title = a.label?.trim() || artifactSummaryLabel(contents)
                const container = containerDisplayName(a, definitionMap)
                return (
                  <Box
                    key={a.id}
                    borderRadius="md"
                    cursor="pointer"
                    minW={0}
                    w="100%"
                    p={2}
                    _hover={{ bg: "primary.subtle/40" }}
                    onClick={() => choose(a.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault()
                        choose(a.id)
                      }
                    }}
                  >
                    <Text fontSize="sm" fontWeight="semibold">
                      {title}{" "}
                      <Badge size="sm" variant="outline">
                        {artifactKindBadge(contents)}
                      </Badge>
                    </Text>
                    {container ? (
                      <Text fontSize="xs" color="fg.muted">
                        {container}
                      </Text>
                    ) : null}
                    <Text fontSize="xs" color="fg.muted">
                      Stored by {a.storedByUsername}
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      Untouched for {formatStashLastTouched(a, now)}
                    </Text>
                  </Box>
                )
              })}
            </VStack>
          )}
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
