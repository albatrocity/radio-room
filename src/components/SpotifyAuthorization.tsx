import { useEffect } from "react"
import { useLocation } from "@reach/router"
import { useSpotifyAuthStore } from "../state/spotifyAuthStore"

export default function SpotifyAuthorization() {
  const location = useLocation()

  const { state, send } = useSpotifyAuthStore()

  const urlParams = new URLSearchParams(location.search)
  const code = urlParams.get("code")

  useEffect(() => {
    if (code) {
      send("REQUEST_TOKEN", { data: code })
    }
  }, [code])

  return null
}
