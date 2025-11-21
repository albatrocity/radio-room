import { create } from "zustand"
// @ts-expect-error - zustand-middleware-xstate has package.json exports issue
import xstate from "zustand-middleware-xstate"
import { playlistMachine } from "../machines/playlistMachine"
import { State, EventObject } from "xstate"
import { QueueItem } from "../types/Queue"

interface PlaylistContext {
  playlist: QueueItem[]
}

export interface PlaylistStore {
  state: State<PlaylistContext, EventObject>
  send: (event: EventObject | string) => void
}

export const usePlaylistStore = create<PlaylistStore>(xstate(playlistMachine) as any)
export const useCurrentPlaylist = () => usePlaylistStore((s) => s.state.context.playlist)
