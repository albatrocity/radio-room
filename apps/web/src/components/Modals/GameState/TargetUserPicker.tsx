import { useMemo, useState, type RefObject } from "react"
import { Combobox, createListCollection, Portal } from "@chakra-ui/react"
import { useCurrentUser, useListeners } from "../../../hooks/useActors"

type TargetOption = { label: string; value: string }

/**
 * Choose another listener (or yourself) for targeted inventory use / gift / trade.
 * Parent handles socket emit after `onPick(targetUserId)`.
 */
export function InventoryTargetUserPopover({
  children,
  onPick,
  includeSelf = true,
  placeholder = "Use on…",
  open,
  onOpenChange,
  anchorRef,
  fullWidth = false,
  size = "xs",
}: {
  children: React.ReactNode
  onPick: (targetUserId: string) => void
  /** When false, only other listeners (for gift/trade). */
  includeSelf?: boolean
  placeholder?: string
  open?: boolean
  onOpenChange?: (details: { open: boolean }) => void
  /** When set, positions the list on this element (e.g. ellipsis menu trigger). */
  anchorRef?: RefObject<HTMLElement | null>
  /** Stretch to parent width (inventory Use button). Default shrinks to the trigger. */
  fullWidth?: boolean
  /** Combobox size; applied to the trigger when `children` is the visible button. */
  size?: "xs" | "sm"
}) {
  const currentUser = useCurrentUser()
  const listeners = useListeners()
  const [query, setQuery] = useState("")
  const [selectedValue, setSelectedValue] = useState<string[]>([])
  const uid = currentUser?.userId

  const resetPicker = () => {
    setQuery("")
    setSelectedValue([])
  }

  const allOptions = useMemo((): TargetOption[] => {
    if (!uid) return []
    const others = listeners
      .filter((u) => u.userId !== uid)
      .map((u) => ({
        label: u.username ?? u.userId,
        value: u.userId,
      }))
    if (!includeSelf) return others
    const self: TargetOption = { label: "Yourself", value: uid }
    return [self, ...others]
  }, [listeners, uid, includeSelf])

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
      resetPicker()
      onPick(targetUserId)
      return
    }
    setSelectedValue(details.value)
  }

  const handleOpenChange = (details: { open: boolean }) => {
    if (details.open) {
      resetPicker()
    }
    onOpenChange?.(details)
  }

  // Shrink to the trigger so the positioner anchors to the button, not a full-width row
  // (unless fullWidth — e.g. inventory Use stacked with Sell).
  const rootWidth = fullWidth ? ("full" as const) : ("fit-content" as const)

  return (
    <Combobox.Root
      collection={collection}
      open={open}
      onOpenChange={handleOpenChange}
      openOnClick={!anchorRef}
      closeOnSelect
      selectionBehavior="clear"
      size={size}
      value={selectedValue}
      inputValue={query}
      onValueChange={handleValueChange}
      onInputValueChange={(e) => setQuery(e.inputValue)}
      w={anchorRef ? "0" : rootWidth}
      h={anchorRef ? "0" : undefined}
      position={anchorRef ? "absolute" : undefined}
      maxW={anchorRef ? undefined : "100%"}
      overflow={anchorRef ? "visible" : undefined}
      positioning={{
        ...(anchorRef
          ? {
              getAnchorRect: () => anchorRef.current?.getBoundingClientRect() ?? null,
            }
          : {}),
        strategy: "fixed",
        placement: anchorRef ? "bottom-end" : "bottom-start",
        flip: true,
        slide: true,
        fitViewport: true,
        overflowPadding: 8,
        // Anchor may be outside this root; don't treat a 0×0 control as "detached".
        hideWhenDetached: !anchorRef,
      }}
    >
      {anchorRef ? (
        // Real trigger is `anchorRef`; keep a inert control for the combobox machine.
        <Combobox.Control position="fixed" top="0" left="0" w="0" h="0" opacity="0" pointerEvents="none">
          <Combobox.Trigger focusable asChild>
            {children}
          </Combobox.Trigger>
        </Combobox.Control>
      ) : (
        <Combobox.Control w={rootWidth} maxW="100%">
          <Combobox.Trigger focusable asChild>
            {children}
          </Combobox.Trigger>
        </Combobox.Control>
      )}
      <Portal>
        <Combobox.Positioner
          w="min(22rem, calc(100vw - 1.5rem))"
          minW="min(16rem, calc(100vw - 1.5rem))"
        >
          <Combobox.Content
            css={{ "--popover-bg": "{colors.appBg}" }}
            width="100%"
            maxHeight="min(70vh, 24rem)"
            overflow="hidden"
            px={0}
          >
            <Combobox.Input
              placeholder={placeholder}
              border="none"
              outline="none"
              px={3}
              py={3}
              minH="44px"
              fontSize="16px"
              lineHeight="1.25"
            />
            <Combobox.Empty px={3} py={3} fontSize="md">
              No listeners match
            </Combobox.Empty>
            <Combobox.ItemGroup
              borderTopWidth="1px"
              pt={1}
              px={1}
              maxH="min(50vh, 16rem)"
              overflowY="auto"
            >
              {collection.items.map((item) => (
                <Combobox.Item
                  key={item.value}
                  item={item}
                  minW={0}
                  minH="44px"
                  px={3}
                  py={3}
                  fontSize="md"
                >
                  <Combobox.ItemText truncate fontSize="md">
                    {item.label}
                  </Combobox.ItemText>
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
