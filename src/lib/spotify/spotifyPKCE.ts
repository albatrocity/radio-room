import ky, { HTTPError } from "ky"
import { SpotifyUserAuthContext } from "../../machines/spotifyUserAuthMachine"

const clientId = process.env.GATSBY_SPOTIFY_CLIENT_ID
export const redirectUri =
  process.env.GATSBY_SPOTIFY_AUTH_REDIRECT_URI ??
  "http://localhost:8000/callback"

function generateRandomString(length: number) {
  let text = ""
  let possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

  for (let i = 0; i < length; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length))
  }
  return text
}

export async function generateCodeVerifier() {
  return generateRandomString(128)
}

async function generateCodeChallenge(codeVerifier: string) {
  function base64encode(string: ArrayBuffer) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(string)))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  }

  const encoder = new TextEncoder()
  const data = encoder.encode(codeVerifier)
  const digest = await window.crypto.subtle.digest("SHA-256", data)

  return base64encode(digest)
}

export async function generateLoginUrl(ctx: SpotifyUserAuthContext) {
  if (!clientId) {
    throw new Error("No client ID found")
  }
  if (!ctx.codeVerifier) {
    throw new Error("No code verifier found")
  }

  const codeChallenge = await generateCodeChallenge(ctx.codeVerifier)

  const state = generateRandomString(16)
  const scope = "playlist-modify-private user-library-read user-library-modify"

  const args = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: scope,
    redirect_uri: redirectUri,
    state: state,
    code_challenge_method: "S256",
    code_challenge: codeChallenge,
  })

  return "https://accounts.spotify.com/authorize?" + args
}

export async function requestToken(ctx: SpotifyUserAuthContext) {
  if (!clientId) {
    throw new Error("No client ID found")
  }
  if (!ctx.codeVerifier) {
    throw new Error("No code verifier found")
  }
  if (!ctx.code) {
    throw new Error("No code found")
  }

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: ctx.code,
    redirect_uri: redirectUri,
    client_id: clientId,
    code_verifier: ctx.codeVerifier,
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
    return res
  } catch (e: HTTPError | any) {
    if (e.name === "HTTPError") {
      const errorJson = await e.response.json()
      throw new Error(errorJson)
    }
  }
}

export async function refreshAccessToken(ctx: SpotifyUserAuthContext) {
  if (!clientId) {
    throw new Error("No client ID found")
  }
  if (!ctx.refreshToken) {
    throw new Error("No refresh token found")
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: ctx.refreshToken,
    client_id: clientId,
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
    return res
  } catch (e: HTTPError | any) {
    if (e.name === "HTTPError") {
      const errorJson = await e.response.json()
      throw new Error(errorJson)
    }
  }
}
