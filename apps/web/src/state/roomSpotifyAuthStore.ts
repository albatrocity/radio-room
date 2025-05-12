import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { spotifyAuthMachine } from "../machines/spotifyAuthMachine"

export const useRoomSpotifyAuthStore = create(xstate(spotifyAuthMachine))

export const useIsRoomSpotifyAuthenticated = () => {
  return useRoomSpotifyAuthStore((s) => s.state.matches("authenticated"))
}
