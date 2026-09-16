import { useMemo, useState } from "react"
import {
  Box,
  Button,
  Combobox,
  createListCollection,
  Input,
  Popover,
  Stack,
  Text,
} from "@chakra-ui/react"
import type { InventoryItem, ItemDefinition } from "@repo/types"
import { isStorageContainerDefinition } from "@repo/types"
import { StashPublicFields } from "./StashPublicFields"

type ItemOption = { label: string; value: string }

const popoverPositioning = {
  strategy: "fixed" as const,
  placement: "bottom-end" as const,
  flip: true,
  slide: true,
  fitViewport: true,
  overflowPadding: 8,
}

/**
 * Multi-select stacks to store in a passworded container, then enter a password.
 */
export function InventoryItemStoragePopover({
  children,
  excludingItemId,
  items,
  definitionMap,
  capacity = 1,
  onConfirm,
}: {
  children: React.ReactNode
  excludingItemId: string
  items: InventoryItem[]
  definitionMap: Map<string, ItemDefinition>
  capacity?: number
  onConfirm: (
    targetInventoryItemIds: string[],
    password: string,
    label?: string,
    note?: string,
  ) => void
}) {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<"pick" | "lock">("pick")
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [password, setPassword] = useState("")
  const [label, setLabel] = useState("")
  const [note, setNote] = useState("")

  const selectable = items.filter((invItem) => {
    if (invItem.itemId === excludingItemId) return false
    const def = definitionMap.get(invItem.definitionId)
    if (isStorageContainerDefinition(def)) return false
    return true
  })

  const allOptions = useMemo((): ItemOption[] => {
    return selectable.map((invItem) => {
      const def = definitionMap.get(invItem.definitionId)
      const name = def?.name ?? invItem.definitionId
      const qty = invItem.quantity > 1 ? ` ×${invItem.quantity}` : ""
      return { label: `${name}${qty}`, value: invItem.itemId }
    })
  }, [selectable, definitionMap])

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

  const reset = () => {
    setStep("pick")
    setPickedIds([])
    setQuery("")
    setPassword("")
    setLabel("")
    setNote("")
  }

  const handleOpenChange = (details: { open: boolean }) => {
    setOpen(details.open)
    if (!details.open) reset()
  }

  const submit = () => {
    if (pickedIds.length === 0 || !password.trim()) return
    const ids = pickedIds
    const pw = password
    const name = label.trim() || undefined
    const hint = note.trim() || undefined
    setOpen(false)
    reset()
    onConfirm(ids, pw, name, hint)
  }

  const pickedLabels = pickedIds
    .map((id) => allOptions.find((o) => o.value === id)?.label ?? "Item")
    .join(", ")

  return (
    <Popover.Root
      open={open}
      onOpenChange={handleOpenChange}
      lazyMount
      portalled={false}
      positioning={popoverPositioning}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content
          css={{ "--popover-bg": "{colors.appBg}" }}
          minW="260px"
          w="min(22rem, calc(100vw - 1.5rem))"
          maxH="min(70vh, 28rem)"
          display="flex"
          flexDirection="column"
          overflow="visible"
          p={3}
        >
          <Popover.Arrow css={{ "--arrow-bg": "{colors.appBg}", "--arrow-size": "10px" }}>
            <Popover.ArrowTip />
          </Popover.Arrow>
          <Box flex="1" minH={0} overflowY="auto">
            {step === "pick" ? (
              <Stack gap={2}>
                <Text fontSize="sm" fontWeight="semibold">
                  Store which items? ({pickedIds.length}/{capacity})
                </Text>
                {selectable.length === 0 ? (
                  <Text fontSize="xs" color="fg.muted">
                    No other items to store.
                  </Text>
                ) : (
                  <Combobox.Root
                    multiple
                    closeOnSelect={false}
                    open
                    disableLayer
                    selectionBehavior="preserve"
                    collection={collection}
                    value={pickedIds}
                    onValueChange={(details) => {
                      if (details.value.length > capacity) return
                      setPickedIds(details.value)
                    }}
                    inputValue={query}
                    onInputValueChange={(e) => setQuery(e.inputValue)}
                    size="sm"
                  >
                    <Combobox.Control>
                      <Combobox.Input placeholder="Search items…" />
                    </Combobox.Control>
                    <Combobox.Content
                      position="relative"
                      shadow="none"
                      borderWidth={0}
                      p={0}
                      mt={1}
                      width="100%"
                      maxH="none"
                    >
                      <Combobox.Empty py={2} fontSize="sm">
                        No items match
                      </Combobox.Empty>
                      <Combobox.ItemGroup>
                        {collection.items.map((item) => (
                          <Combobox.Item key={item.value} item={item} minH="40px" px={2} py={2}>
                            <Combobox.ItemText truncate>{item.label}</Combobox.ItemText>
                            <Combobox.ItemIndicator />
                          </Combobox.Item>
                        ))}
                      </Combobox.ItemGroup>
                    </Combobox.Content>
                  </Combobox.Root>
                )}
                <Button
                  size="xs"
                  colorPalette="action"
                  disabled={pickedIds.length === 0}
                  onClick={() => setStep("lock")}
                >
                  Next
                </Button>
              </Stack>
            ) : (
              <Stack gap={2}>
                <Text fontSize="sm">
                  Locking: <strong>{pickedLabels}</strong>
                </Text>
                <StashPublicFields
                  label={label}
                  note={note}
                  onLabelChange={setLabel}
                  onNoteChange={setNote}
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Button
                  size="xs"
                  colorPalette="action"
                  onClick={submit}
                  disabled={!password.trim()}
                >
                  Store
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setStep("pick")}>
                  Back
                </Button>
              </Stack>
            )}
          </Box>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
