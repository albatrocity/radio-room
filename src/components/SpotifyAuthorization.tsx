import { useEffect } from "react"
import { useLocation, navigate } from "@reach/router"
import ky, { HTTPError } from "ky"

const clientId = process.env.GATSBY_SPOTIFY_CLIENT_ID
const redirectUri = "http://localhost:8000/callback"

export default function SpotifyAuthorization() {
  const location = useLocation()
  console.log(location)

  const urlParams = new URLSearchParams(location.search)
  const code = urlParams.get("code")

  console.log(code)

  const codeVerifier = localStorage.getItem("code_verifier")

  useEffect(() => {
    async function requestToken() {
      const body = new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        code_verifier: codeVerifier,
      })

      try {
        const res = await ky
          .post("https://accounts.spotify.com/api/token", {
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: body,
          })
          .json()
        console.log(res)
      } catch (e: HTTPError | any) {
        if (e.name === "HTTPError") {
          const errorJson = await e.response.json()
          if (errorJson.error === "invalid_grant") {
            navigate("/?error=invalid_grant")
          }
        }
      }
    }

    if (code) {
      requestToken()
    }
  }, [code])

  return null
}
