"use client"

import { Button, Input, Popover, Stack, Text } from "@chakra-ui/react"
import { useState } from "react"
import { StashPublicFields } from "./StashPublicFields"

type Props = {
  maxCoins: number
  onConfirm: (coinAmount: number, password: string, label?: string, note?: string) => void
  children: React.ReactNode
}

export function StudioCoinAmountStoragePopover({ maxCoins, onConfirm, children }: Props) {
  const [open, setOpen] = useState(false)
  const [amountStr, setAmountStr] = useState("")
  const [password, setPassword] = useState("")
  const [label, setLabel] = useState("")
  const [note, setNote] = useState("")

  const reset = () => {
    setAmountStr("")
    setPassword("")
    setLabel("")
    setNote("")
  }

  const submit = () => {
    const n = Number.parseInt(amountStr, 10)
    if (!Number.isFinite(n) || n < 1 || n > maxCoins) return
    if (!password.trim()) return
    const pw = password
    const name = label.trim() || undefined
    const hint = note.trim() || undefined
    setOpen(false)
    reset()
    onConfirm(n, pw, name, hint)
  }

  const parsed = Number.parseInt(amountStr, 10)
  const amountOk =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= maxCoins && maxCoins >= 1

  return (
    <Popover.Root
      open={open}
      onOpenChange={(e) => {
        setOpen(e.open)
        if (!e.open) reset()
      }}
      lazyMount
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>
      <Popover.Positioner>
        <Popover.Content minW="260px" p={3}>
          <Stack gap={2}>
            <Text fontSize="sm" fontWeight="semibold">
              Coins to store (max {maxCoins.toLocaleString()})
            </Text>
            <Input
              inputMode="numeric"
              placeholder="Amount"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value.replace(/\D/g, ""))}
            />
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
            <Button size="xs" onClick={submit} disabled={!password.trim() || !amountStr || !amountOk}>
              Lock coins
            </Button>
          </Stack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
