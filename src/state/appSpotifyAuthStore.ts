import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { spotifyAuthMachine } from "../machines/spotifyAuthMachine"

export const useAppSpotifyAuthStore = create(xstate(spotifyAuthMachine))

export const useIsAppSpotifyAuthenticated = () => {
  return useAppSpotifyAuthStore((s) => s.state.matches("authenticated"))
}
