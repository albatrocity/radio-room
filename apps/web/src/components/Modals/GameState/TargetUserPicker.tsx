import { useMemo, useState } from "react"
import { Combobox, createListCollection, Portal } from "@chakra-ui/react"
import { useCurrentUser, useListeners } from "../../../hooks/useActors"

type TargetOption = { label: string; value: string }

/**
 * Choose another listener (or yourself) for targeted inventory use.
 * Parent handles socket emit after `onPick(targetUserId)`.
 */
export function InventoryTargetUserPopover({
  children,
  onPick,
}: {
  children: React.ReactNode
  onPick: (targetUserId: string) => void
}) {
  const currentUser = useCurrentUser()
  const listeners = useListeners()
  const [query, setQuery] = useState("")
  const uid = currentUser?.userId

  const allOptions = useMemo((): TargetOption[] => {
    if (!uid) return []
    const self: TargetOption = { label: "Yourself", value: uid }
    const others = listeners
      .filter((u) => u.userId !== uid)
      .map((u) => ({
        label: u.username ?? u.userId,
        value: u.userId,
      }))
    return [self, ...others]
  }, [listeners, uid])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allOptions
    return allOptions.filter((o) => o.label.toLowerCase().includes(q))
  }, [allOptions, query])

  const collection = useMemo(
    () =>
      createListCollection({
        items: filteredOptions,
        itemToString: (item) => item.label,
        itemToValue: (item) => item.value,
      }),
    [filteredOptions],
  )

  if (!uid) return null

  const handleValueChange = (details: { value: string[] }) => {
    const targetUserId = details.value[0]
    if (targetUserId) {
      setQuery("")
      onPick(targetUserId)
    }
  }

  return (
    <Combobox.Root
      collection={collection}
      openOnClick
      closeOnSelect
      selectionBehavior="clear"
      size="xs"
      onValueChange={handleValueChange}
      onInputValueChange={(e) => setQuery(e.inputValue)}
      positioning={{
        strategy: "fixed",
        placement: "bottom-end",
        flip: true,
        slide: true,
        fitViewport: true,
        overflowPadding: 8,
        hideWhenDetached: true,
      }}
    >
      <Combobox.Control>
        <Combobox.Trigger focusable asChild>
          {children}
        </Combobox.Trigger>
      </Combobox.Control>
      <Portal>
        <Combobox.Positioner
          style={{
            minWidth: 0,
            width: "min(220px, var(--available-width, 220px))",
          }}
        >
          <Combobox.Content
            css={{ "--popover-bg": "{colors.appBg}" }}
            width="100%"
            maxHeight="var(--available-height, 50vh)"
            overflow="hidden"
            px={0}
          >
            <Combobox.Input placeholder="Use on…" border="none" outline="none" px={2} py={2} />
            <Combobox.Empty px={2} py={1} fontSize="sm">
              No listeners match
            </Combobox.Empty>
            <Combobox.ItemGroup borderTopWidth="1px" pt={1} px={1} maxH="200px" overflowY="auto">
              {collection.items.map((item) => (
                <Combobox.Item key={item.value} item={item} minW={0}>
                  <Combobox.ItemText truncate>{item.label}</Combobox.ItemText>
                  <Combobox.ItemIndicator />
                </Combobox.Item>
              ))}
            </Combobox.ItemGroup>
          </Combobox.Content>
        </Combobox.Positioner>
      </Portal>
    </Combobox.Root>
  )
}
