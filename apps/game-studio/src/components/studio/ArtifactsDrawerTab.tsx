"use client"

import {
  Button,
  Field,
  Heading,
  HStack,
  Input,
  NativeSelect,
  Separator,
  Stack,
  Text,
} from "@chakra-ui/react"
import { ITEM_CATALOG } from "@repo/plugin-item-shops"
import { useMemo, useState } from "react"
import * as studioActions from "../../studio/studioActions"
import type { StudioRoom } from "../../studio/studioRoom"
import { toaster } from "../ui/toaster"

export type ArtifactsDrawerTabProps = {
  room: StudioRoom
  defaultUserId: string
}

export function ArtifactsDrawerTab({ room, defaultUserId }: ArtifactsDrawerTabProps) {
  const sortedItems = useMemo(
    () => [...ITEM_CATALOG].sort((a, b) => a.definition.name.localeCompare(b.definition.name)),
    [],
  )

  const [storedByPick, setStoredByPick] = useState<string | null>(null)
  const storedBy = storedByPick ?? defaultUserId

  const [coinAmount, setCoinAmount] = useState("100")
  const [coinPassword, setCoinPassword] = useState("")

  const [itemShortId, setItemShortId] = useState(sortedItems[0]?.definition.shortId ?? "")
  const [itemQty, setItemQty] = useState("1")
  const [itemPassword, setItemPassword] = useState("")

  async function toast(title: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    try {
      const res = await fn()
      toaster.create({
        title: res.success ? title : `${title} failed`,
        description: res.message,
        type: res.success ? "success" : "error",
      })
    } catch (e) {
      toaster.create({
        title: `${title} error`,
        description: String(e),
        type: "error",
      })
    }
  }

  return (
    <Stack gap="4" mt="4">
      <Text fontSize="xs" color="fg.muted">
        Adds password-protected rows to sandbox global storage (same shape as Van Cubby / Merch Cash Box). Start a
        game session first so item definitions load. State syncs to studio-bridge for the Listening Room preview.
      </Text>

      <Field.Root>
        <Field.Label fontSize="sm">Attributed to user</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field value={storedBy} onChange={(e) => setStoredByPick(e.target.value)}>
            {[...room.users.keys()].map((id) => (
              <option key={id} value={id}>
                {room.users.get(id)?.username ?? id}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>

      <Heading size="sm">Store coins</Heading>
      <HStack gap="2" align="flex-end" flexWrap="wrap">
        <Field.Root flex="1" minW="120px">
          <Field.Label fontSize="xs">Amount</Field.Label>
          <Input
            size="sm"
            type="number"
            min={1}
            value={coinAmount}
            onChange={(e) => setCoinAmount(e.target.value)}
          />
        </Field.Root>
        <Field.Root flex="2" minW="140px">
          <Field.Label fontSize="xs">Password</Field.Label>
          <Input
            size="sm"
            type="password"
            autoComplete="new-password"
            value={coinPassword}
            onChange={(e) => setCoinPassword(e.target.value)}
          />
        </Field.Root>
        <Button
          size="sm"
          variant="surface"
          onClick={() =>
            void toast("Coins stored", () =>
              studioActions.storeSandboxArtifactCoin(storedBy, Number(coinAmount), coinPassword),
            )
          }
        >
          Add coins
        </Button>
      </HStack>

      <Separator />

      <Heading size="sm">Store item</Heading>
      <Field.Root>
        <Field.Label fontSize="xs">Item</Field.Label>
        <NativeSelect.Root size="sm">
          <NativeSelect.Field value={itemShortId} onChange={(e) => setItemShortId(e.target.value)}>
            {sortedItems.map((entry) => (
              <option key={entry.definition.shortId} value={entry.definition.shortId}>
                {entry.definition.name}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      </Field.Root>
      <HStack gap="2" align="flex-end" flexWrap="wrap">
        <Field.Root flex="1" minW="80px">
          <Field.Label fontSize="xs">Qty</Field.Label>
          <Input
            size="sm"
            type="number"
            min={1}
            value={itemQty}
            onChange={(e) => setItemQty(e.target.value)}
          />
        </Field.Root>
        <Field.Root flex="2" minW="140px">
          <Field.Label fontSize="xs">Password</Field.Label>
          <Input
            size="sm"
            type="password"
            autoComplete="new-password"
            value={itemPassword}
            onChange={(e) => setItemPassword(e.target.value)}
          />
        </Field.Root>
        <Button
          size="sm"
          variant="surface"
          onClick={() =>
            void toast("Item stored", () =>
              studioActions.storeSandboxArtifactItem(storedBy, itemShortId, Number(itemQty), itemPassword),
            )
          }
        >
          Add item
        </Button>
      </HStack>

      <Separator />

      <Heading size="sm">In sandbox storage</Heading>
      {room.storedArtifacts.length === 0 ? (
        <Text fontSize="sm" color="fg.muted">
          Nothing stored yet.
        </Text>
      ) : (
        <Stack gap="2">
          {room.storedArtifacts.map((a) => (
            <HStack key={a.id} justify="space-between" align="flex-start" gap="2">
              <Stack gap="0" flex="1" minW="0">
                <Text fontSize="sm" fontWeight="medium">
                  {a.artifactType === "coin"
                    ? `${(a.coinValue ?? 0).toLocaleString()} coins`
                    : `${a.itemQuantity ?? 1}× ${a.itemName ?? "item"}`}
                </Text>
                <Text fontSize="xs" color="fg.muted">
                  by {a.storedByUsername} · id {a.id.slice(0, 8)}…
                </Text>
              </Stack>
              <Button
                size="xs"
                variant="outline"
                colorPalette="red"
                onClick={() =>
                  void toast("Removed", () => studioActions.removeSandboxStoredArtifact(a.id))
                }
              >
                Remove
              </Button>
            </HStack>
          ))}
        </Stack>
      )}
    </Stack>
  )
}
