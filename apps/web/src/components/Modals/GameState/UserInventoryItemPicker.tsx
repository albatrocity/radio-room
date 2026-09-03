import { useCallback, useEffect, useRef } from "react"
import { useMachine } from "@xstate/react"
import { Box, Button, Popover, Portal, ScrollArea, Stack, Text } from "@chakra-ui/react"
import type { SnapshotFrom } from "xstate"
import type { UserInventoryPeekResult } from "@repo/types"
import { emitToSocket } from "../../../actors/socketActor"
import { useSocketResultHandle } from "../../../lib/subscribeForSocketResult"
import { useListeners } from "../../../hooks/useActors"
import ScrollShadowViewport from "../../ScrollShadowViewport"
import { inventoryPeekMachine } from "../../../machines/inventoryPeekMachine"
import { InventoryTargetUserPopover } from "./TargetUserPicker"
import { TradeItemRow } from "./trade/TradeItemRow"

export type UserInventoryPeekMode = "view" | "select"

type SharedPeekProps = {
  children: React.ReactNode
  /**
   * When set, gates peek via item-use policy (Black Bag). Omit when authorized
   * by `inventory_peek` flag or trading (ADR 0149).
   */
  itemId?: string
  mode?: UserInventoryPeekMode
  fullWidth?: boolean
  /** Listener combobox placeholder (user-pick flow only). */
  placeholder?: string
}

type SelectModeProps = SharedPeekProps & {
  mode?: "select"
  onConfirm: (targetUserId: string, targetInventoryItemId: string) => void
  /** When set, skip the listener picker and peek this user immediately. */
  fixedTargetUserId?: never
  targetLabel?: never
  startOnMount?: never
}

type ViewModeProps = SharedPeekProps & {
  mode: "view"
  onConfirm?: never
  fixedTargetUserId?: never
  targetLabel?: never
  startOnMount?: never
}

type ViewFixedTargetProps = SharedPeekProps & {
  mode: "view"
  onConfirm?: never
  /**
   * Skip the listener picker and peek this user when the trigger is activated
   * (listener-list X-Ray control).
   */
  fixedTargetUserId: string
  /**
   * Display label for the fixed target. Passed in rather than looked up so this
   * mode carries no `useListeners()` subscription — one picker can be mounted
   * per listener row (perf review P2).
   */
  targetLabel: string
  /**
   * Peek (and therefore open) as soon as the picker mounts. Lets an owner defer
   * mounting the picker until the first click without swallowing that click.
   */
  startOnMount?: boolean
}

export type UserInventoryItemPickerProps = SelectModeProps | ViewModeProps | ViewFixedTargetProps

type PeekSnapshot = SnapshotFrom<typeof inventoryPeekMachine>

const peekPositioning = {
  strategy: "fixed" as const,
  placement: "bottom-end" as const,
  flip: true,
  slide: true,
  fitViewport: true,
  overflowPadding: 12,
}

/** Stored when nothing is in flight; `track` cancels the previous handle for us. */
const NO_PENDING_PEEK = () => {}

/**
 * Monotonic so two pickers (or a StrictMode double-mount) started in the same
 * millisecond cannot claim the same socketActor subscription id.
 */
let peekSubscriptionSeq = 0

/**
 * Owns one `PEEK_USER_INVENTORY` request lifecycle. `useSocketResultHandle`
 * cancels the in-flight subscription on unmount and whenever a new peek starts,
 * so an abandoned peek can no longer fire a timeout toast at a dead component.
 */
function usePeekRequest(itemId: string | undefined) {
  const [peekState, sendPeek] = useMachine(inventoryPeekMachine)
  const { subscribe, track } = useSocketResultHandle()

  const closePeek = useCallback(() => {
    track(NO_PENDING_PEEK)
    sendPeek({ type: "CLOSE" })
  }, [sendPeek, track])

  const startPeek = useCallback(
    (pickedUserId: string) => {
      sendPeek({ type: "PEEK", targetUserId: pickedUserId })

      peekSubscriptionSeq += 1
      subscribe<UserInventoryPeekResult>({
        id: `peek-user-inv-${itemId ?? "flag"}-${pickedUserId}-${peekSubscriptionSeq}`,
        eventType: "USER_INVENTORY_PEEK_RESULT",
        onResult: (data) => sendPeek({ type: "RESULT", data }),
        onTimeout: () => sendPeek({ type: "TIMEOUT" }),
      })

      emitToSocket("PEEK_USER_INVENTORY", {
        targetUserId: pickedUserId,
        ...(itemId != null ? { itemId } : {}),
      })
    },
    [itemId, sendPeek, subscribe],
  )

  return { peekState, startPeek, closePeek }
}

function PeekPopoverBody({
  mode,
  targetLabel,
  peekState,
  onChooseItem,
  onClose,
}: {
  mode: UserInventoryPeekMode
  targetLabel: string
  peekState: PeekSnapshot
  onChooseItem: (itemId: string) => void
  onClose: () => void
}) {
  const peekItems = peekState.context.items
  const peekLoading = peekState.matches("loading")
  const emptyMessage = mode === "view" ? "Their inventory is empty." : "They have nothing to steal."
  const peekError = peekState.matches("empty") ? emptyMessage : peekState.context.error
  const title = mode === "view" ? `Looking at ${targetLabel}` : `Steal from ${targetLabel}`

  return (
    <Portal>
      <Popover.Positioner zIndex="popover">
        <Popover.Content
          bg="appBg"
          borderWidth="1px"
          borderColor="border"
          shadow="lg"
          css={{ "--popover-bg": "{colors.appBg}" }}
          minW="280px"
          w="min(22rem, calc(100vw - 1.5rem))"
          maxH="min(70vh, 28rem)"
          display="flex"
          flexDirection="column"
          p={3}
          overflow="visible"
        >
          <Popover.Arrow css={{ "--arrow-bg": "{colors.appBg}", "--arrow-size": "10px" }}>
            <Popover.ArrowTip />
          </Popover.Arrow>
          <Text fontSize="sm" fontWeight="semibold" flexShrink={0} mb={2} px={1}>
            {title}
          </Text>
          {peekLoading ? (
            <Text fontSize="xs" color="fg.muted" flexShrink={0} px={1}>
              Looking through their stuff…
            </Text>
          ) : peekError ? (
            <Text fontSize="xs" color="fg.muted" flexShrink={0} px={1}>
              {peekError}
            </Text>
          ) : (
            <Box flex="1" minH={0} maxH="min(55vh, 22rem)" overflow="hidden">
              <ScrollArea.Root size="xs" height="full">
                <ScrollShadowViewport>
                  <ScrollArea.Content py={3} px={4}>
                    <Stack gap={2}>
                      {peekItems.map((row) => (
                        <TradeItemRow
                          key={row.itemId}
                          name={row.name}
                          quantity={row.quantity}
                          def={{
                            name: row.name,
                            icon: row.icon,
                            imageUrl: row.imageUrl,
                            artworkFrame: row.artworkFrame,
                            slotPool: row.slotPool,
                          }}
                          onActivate={
                            mode === "select" ? () => onChooseItem(row.itemId) : undefined
                          }
                          activateLabel={mode === "select" ? `Steal ${row.name}` : undefined}
                        />
                      ))}
                    </Stack>
                  </ScrollArea.Content>
                </ScrollShadowViewport>
                <ScrollArea.Scrollbar orientation="vertical" />
              </ScrollArea.Root>
            </Box>
          )}
          <Button size="xs" variant="ghost" onClick={onClose} flexShrink={0} mt={2}>
            {mode === "view" ? "Close" : "Cancel"}
          </Button>
        </Popover.Content>
      </Popover.Positioner>
    </Portal>
  )
}

const noopChooseItem = () => {}

/**
 * X-Ray listener-row control: one known target, no listener subscription.
 * The trigger is the caller's `children`, so the popover anchors to the same
 * button whether it was mounted eagerly or on first click (`startOnMount`).
 */
function FixedTargetPeekPicker({
  children,
  itemId,
  fullWidth,
  targetUserId,
  targetLabel,
  startOnMount = false,
}: {
  children: React.ReactNode
  itemId?: string
  fullWidth: boolean
  targetUserId: string
  targetLabel: string
  startOnMount?: boolean
}) {
  const triggerRef = useRef<HTMLDivElement>(null)
  const { peekState, startPeek, closePeek } = usePeekRequest(itemId)
  const itemsOpen = !peekState.matches("idle")

  useEffect(() => {
    if (!startOnMount) return
    startPeek(targetUserId)
  }, [startOnMount, startPeek, targetUserId])

  return (
    <Popover.Root
      open={itemsOpen}
      onOpenChange={(e) => {
        if (!e.open) {
          closePeek()
          return
        }
        if (!itemsOpen) startPeek(targetUserId)
      }}
      lazyMount
      portalled
      positioning={peekPositioning}
    >
      <Popover.Trigger asChild>
        <Box ref={triggerRef} w={fullWidth ? "full" : "fit-content"} maxW="100%">
          {children}
        </Box>
      </Popover.Trigger>
      <PeekPopoverBody
        mode="view"
        targetLabel={targetLabel}
        peekState={peekState}
        onChooseItem={noopChooseItem}
        onClose={closePeek}
      />
    </Popover.Root>
  )
}

/** Pick a listener, peek them, then (in `select` mode) pick one of their stacks. */
function PickTargetPeekPicker({
  children,
  itemId,
  mode,
  fullWidth,
  placeholder,
  onConfirm,
}: {
  children: React.ReactNode
  itemId?: string
  mode: UserInventoryPeekMode
  fullWidth: boolean
  placeholder: string
  onConfirm?: (targetUserId: string, targetInventoryItemId: string) => void
}) {
  const listeners = useListeners()
  const triggerRef = useRef<HTMLDivElement>(null)
  const { peekState, startPeek, closePeek } = usePeekRequest(itemId)

  const { targetUserId } = peekState.context
  const itemsOpen = !peekState.matches("idle")
  const targetLabel =
    targetUserId != null
      ? (listeners.find((u) => u.userId === targetUserId)?.username ?? targetUserId)
      : ""

  const chooseItem = (targetInventoryItemId: string) => {
    if (!targetUserId || !onConfirm) return
    const uid = targetUserId
    closePeek()
    onConfirm(uid, targetInventoryItemId)
  }

  return (
    <>
      <Box ref={triggerRef} w={fullWidth ? "full" : "fit-content"} maxW="100%">
        <InventoryTargetUserPopover
          includeSelf={false}
          placeholder={placeholder}
          fullWidth={fullWidth}
          size="sm"
          active={itemsOpen}
          onPick={startPeek}
        >
          {children}
        </InventoryTargetUserPopover>
      </Box>
      <Popover.Root
        open={itemsOpen}
        onOpenChange={(e) => {
          if (!e.open) closePeek()
        }}
        lazyMount
        portalled
        positioning={{
          ...peekPositioning,
          getAnchorRect: () => triggerRef.current?.getBoundingClientRect() ?? null,
        }}
      >
        <Popover.Trigger asChild>
          <Box position="fixed" w="0" h="0" opacity="0" pointerEvents="none" aria-hidden />
        </Popover.Trigger>
        <PeekPopoverBody
          mode={mode}
          targetLabel={targetLabel}
          peekState={peekState}
          onChooseItem={chooseItem}
          onClose={closePeek}
        />
      </Popover.Root>
    </>
  )
}

/**
 * Peek another user's inventory (ADR 0147 / 0149).
 * - `select`: pick a user → peek → pick a stack (Black Bag).
 * - `view`: pick a user (or fixed target) → read-only list (X-Ray).
 */
export function UserInventoryItemPicker(props: UserInventoryItemPickerProps) {
  const { children, itemId, fullWidth = true } = props

  if (props.mode === "view") {
    if (props.fixedTargetUserId != null) {
      return (
        <FixedTargetPeekPicker
          itemId={itemId}
          fullWidth={fullWidth}
          targetUserId={props.fixedTargetUserId}
          targetLabel={props.targetLabel}
          startOnMount={props.startOnMount}
        >
          {children}
        </FixedTargetPeekPicker>
      )
    }
    return (
      <PickTargetPeekPicker
        itemId={itemId}
        mode="view"
        fullWidth={fullWidth}
        placeholder={props.placeholder ?? "Look at…"}
      >
        {children}
      </PickTargetPeekPicker>
    )
  }

  return (
    <PickTargetPeekPicker
      itemId={itemId}
      mode="select"
      fullWidth={fullWidth}
      placeholder={props.placeholder ?? "Steal from…"}
      onConfirm={props.onConfirm}
    >
      {children}
    </PickTargetPeekPicker>
  )
}
