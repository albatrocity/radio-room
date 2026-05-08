"use client"

import { Button, Input, Popover, Stack, Text } from "@chakra-ui/react"
import { useState } from "react"

type Props = {
  maxCoins: number
  onConfirm: (coinAmount: number, password: string) => void
  children: React.ReactNode
}

/**
 * Choose coin amount and password for Merch Cash Box (Game Studio).
 */
export function StudioCoinAmountStoragePopover({ maxCoins, onConfirm, children }: Props) {
  const [open, setOpen] = useState(false)
  const [amountStr, setAmountStr] = useState("")
  const [password, setPassword] = useState("")

  const reset = () => {
    setAmountStr("")
    setPassword("")
  }

  const handleOpenChange = (e: { open: boolean }) => {
    setOpen(e.open)
    if (!e.open) reset()
  }

  const submit = () => {
    const n = Number.parseInt(amountStr, 10)
    if (!Number.isFinite(n) || n < 1 || n > maxCoins) return
    if (!password.trim()) return
    const pw = password
    setOpen(false)
    reset()
    onConfirm(n, pw)
  }

  const parsed = Number.parseInt(amountStr, 10)
  const amountOk =
    Number.isFinite(parsed) && parsed >= 1 && parsed <= maxCoins && maxCoins >= 1

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange} lazyMount>
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
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <Button
              size="xs"
              onClick={submit}
              disabled={!password.trim() || !amountStr || !amountOk}
            >
              Lock coins
            </Button>
          </Stack>
        </Popover.Content>
      </Popover.Positioner>
    </Popover.Root>
  )
}
