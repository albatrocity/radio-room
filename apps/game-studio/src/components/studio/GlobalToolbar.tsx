"use client"

import {
  Button,
  Heading,
  HStack,
  IconButton,
  Input,
  Separator,
  Text,
} from "@chakra-ui/react"
import {
  Eraser,
  Moon,
  Plus,
  RotateCcw,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Square,
  Sun,
} from "lucide-react"
import type { StudioRoom } from "../../studio/studioRoom"
import { isShoppingRoundActive } from "../../studio/studioShoppingRead"
import { useColorMode } from "../ui/color-mode"

export type GlobalToolbarProps = {
  room: StudioRoom
  newUsername: string
  setNewUsername: (v: string) => void
  onAddUser: () => void
  onStartGame: () => void
  onEndGame: () => void
  onStartShopping: () => void
  onEndShopping: () => void
  onOpenItemDrawer: () => void
  onClearSandbox: () => void
  onResetSandbox: () => void
}

export function GlobalToolbar({
  room,
  newUsername,
  setNewUsername,
  onAddUser,
  onStartGame,
  onEndGame,
  onStartShopping,
  onEndShopping,
  onOpenItemDrawer,
  onClearSandbox,
  onResetSandbox,
}: GlobalToolbarProps) {
  const hasSession = !!room.activeSession
  const shoppingActive = isShoppingRoundActive(room)
  const { colorMode, toggleColorMode } = useColorMode()

  return (
    <HStack
      wrap="wrap"
      gap="3"
      align="center"
      justify="space-between"
      borderBottomWidth="1px"
      pb="4"
      mb="4"
    >
      <HStack gap="3">
        <Sparkles size={22} />
        <Heading size="lg">Game Studio</Heading>
        <Text fontSize="sm" color="fg.muted">
          Sandbox state persists in this browser (survives HMR and refresh)
        </Text>
      </HStack>

      <HStack wrap="wrap" gap="2">
        <IconButton
          variant="ghost"
          aria-label="Toggle color mode"
          onClick={toggleColorMode}
          title="Toggle theme"
        >
          {colorMode === "light" ? <Moon size={18} /> : <Sun size={18} />}
        </IconButton>
        <Separator orientation="vertical" height="6" />

        <HStack gap="2">
          <Input
            size="sm"
            width="44"
            placeholder="Username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
          />
          <Button size="sm" variant="outline" onClick={onAddUser}>
            <Plus size={16} /> Add user
          </Button>
        </HStack>

        <Separator orientation="vertical" height="6" />

        <Button size="sm" colorPalette="green" disabled={hasSession} onClick={onStartGame}>
          Start game
        </Button>
        <Button size="sm" variant="outline" colorPalette="red" disabled={!hasSession} onClick={onEndGame}>
          <Square size={14} /> End game
        </Button>

        <Separator orientation="vertical" height="6" />

        <Button
          size="sm"
          disabled={!hasSession || shoppingActive}
          colorPalette="blue"
          onClick={onStartShopping}
        >
          <ShoppingBag size={16} /> Start shopping
        </Button>
        <Button size="sm" variant="outline" disabled={!shoppingActive} onClick={onEndShopping}>
          End shopping
        </Button>

        <Separator orientation="vertical" height="6" />

        <Button size="sm" variant="surface" onClick={onOpenItemDrawer}>
          <ShoppingCart size={16} /> Items & shops
        </Button>

        <Separator orientation="vertical" height="6" />

        <Button size="sm" variant="outline" colorPalette="orange" onClick={onClearSandbox}>
          <Eraser size={16} /> Clear
        </Button>
        <Button size="sm" variant="outline" colorPalette="red" onClick={onResetSandbox}>
          <RotateCcw size={16} /> Reset
        </Button>
      </HStack>
    </HStack>
  )
}
