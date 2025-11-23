import { create } from "zustand"
import xstate from "zustand-middleware-xstate"
import { metadataSourceAuthMachine } from "../machines/metadataSourceAuthMachine"

export const useMetadataSourceAuthStore = create(xstate(metadataSourceAuthMachine))

export const useIsMetadataSourceAuthenticated = () => {
  return useMetadataSourceAuthStore((s) => s.state.matches("authenticated"))
}

