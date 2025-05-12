import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { playlistMachine } from "../machines/playlistMachine"

export const usePlaylistStore = create(xstate(playlistMachine))
export const useCurrentPlaylist = () =>
  usePlaylistStore((s) => s.state.context.playlist)
