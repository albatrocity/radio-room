import {
  PLAYLIST_BINGO_PLUGIN_NAME,
  PLAYLIST_BINGO_STORAGE_KEYS,
  type BingoCard,
} from "@repo/types"
import type { StudioRoom } from "./studioRoom"

export function isBingoRoundActive(room: StudioRoom): boolean {
  const store = room.ensurePluginStore(PLAYLIST_BINGO_PLUGIN_NAME)
  const raw = store.kv.get(PLAYLIST_BINGO_STORAGE_KEYS.ROUND)
  if (!raw) return false
  try {
    return (JSON.parse(raw) as { active?: boolean }).active === true
  } catch {
    return false
  }
}

export function readBingoCard(room: StudioRoom, userId: string): BingoCard | null {
  if (!isBingoRoundActive(room)) return null
  const store = room.ensurePluginStore(PLAYLIST_BINGO_PLUGIN_NAME)
  const raw = store.hashes.get(PLAYLIST_BINGO_STORAGE_KEYS.CARDS)?.get(userId)
  if (!raw) return null
  try {
    return JSON.parse(raw) as BingoCard
  } catch {
    return null
  }
}
