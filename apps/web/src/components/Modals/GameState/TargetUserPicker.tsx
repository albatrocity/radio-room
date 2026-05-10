import { useState } from "react"
import { Button, Popover, Text, VStack } from "@chakra-ui/react"
import { useCurrentUser, useListeners } from "../../../hooks/useActors"

/**
 * Choose another listener (or yourself) for targeted inventory use.
 * Parent handles socket emit after `onPick(targetUserId)`.
 */
export function InventoryUseTargetPopover({
  children,
  onPick,
}: {
  children: React.ReactNode
  onPick: (targetUserId: string) => void
}) {
  const currentUser = useCurrentUser()
  const listeners = useListeners()
  const [open, setOpen] = useState(false)
  const uid = currentUser?.userId

  if (!uid) return null

  const others = listeners.filter((u) => u.userId !== uid)

  const choose = (targetUserId: string) => {
    setOpen(false)
    onPick(targetUserId)
  }

  return (
    <Popover.Root open={open} onOpenChange={(e) => setOpen(e.open)} lazyMount>
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content css={{ "--popover-bg": "{colors.appBg}" }} minW="220px" p={2}>
          <Text fontSize="sm" fontWeight="semibold" mb={2} px={1}>
            Use on…
          </Text>
          <VStack align="stretch" gap={1}>
            <Button size="xs" variant="ghost" justifyContent="flex-start" onClick={() => choose(uid)}>
              Yourself
            </Button>
            {others.map((u) => (
              <Button
                key={u.userId}
                size="xs"
                variant="ghost"
                justifyContent="flex-start"
                onClick={() => choose(u.userId)}
              >
                {u.username}
              </Button>
            ))}
          </VStack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
