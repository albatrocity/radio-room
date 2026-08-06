import { PLAYLIST_BINGO_PLUGIN_NAME } from "@repo/types"

const PREFIX = `PLUGIN:${PLAYLIST_BINGO_PLUGIN_NAME}:` as const

/** Socket `event` types emitted by Playlist Bingo via `context.api.emit`. */
export const PLAYLIST_BINGO_SOCKET_EVENTS = {
  ROUND_STARTED: `${PREFIX}ROUND_STARTED`,
  ROUND_UPDATED: `${PREFIX}ROUND_UPDATED`,
  ROUND_ENDED: `${PREFIX}ROUND_ENDED`,
  BINGO: `${PREFIX}BINGO`,
  CELLS_COVERED: `${PREFIX}CELLS_COVERED`,
} as const
