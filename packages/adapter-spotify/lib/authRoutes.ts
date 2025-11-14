import { Router, Request, Response } from "express"
import querystring from "querystring"
import { AppContext } from "@repo/types"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import generateRandomString from "./generateRandomString"
import { storeUserServiceAuth } from "@repo/server/operations/data/serviceAuthentications"

const stateKey = "spotify_auth_state"
const redirectKey = "after_spotify_auth_redirect"

type ReqQuery = {
  userId?: string
  roomTitle?: string
  redirect?: string
}

export function createSpotifyAuthRoutes(context: AppContext) {
  const router = Router()

  const clientId = process.env.SPOTIFY_CLIENT_ID
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("Missing Spotify OAuth environment variables")
  }

  router.get("/login", async (req: Request<any, any, any, ReqQuery>, res: Response) => {
    const state = generateRandomString(16)

    res.cookie(stateKey, state)
    res.cookie(redirectKey, req.query.redirect)

    const scope =
      "user-read-private user-read-email playlist-modify-public user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify"

    res.redirect(
      "https://accounts.spotify.com/authorize?" +
        querystring.stringify({
          response_type: "code",
          client_id: clientId,
          scope: scope,
          redirect_uri: redirectUri,
          state: state,
        }),
    )
  })

  router.get("/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | null
    const state = req.query.state as string | null

    const storedState = req.cookies ? req.cookies[stateKey] : null
    const redirect = req.cookies ? req.cookies[redirectKey] : null

    if (state === null || state !== storedState || !code) {
      res.redirect(
        "/#" +
          querystring.stringify({
            error: "state_mismatch",
          }),
      )
      return
    }

    res.clearCookie(stateKey)

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch("https://accounts.spotify.com/api/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        },
        body: new URLSearchParams({
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      })

      const tokenData = (await tokenResponse.json()) as {
        access_token: string
        refresh_token: string
        expires_in: number
        token_type: string
        scope: string
      }
      const { access_token, refresh_token, expires_in } = tokenData

      // Get user info
      const spotifyApi = SpotifyApi.withAccessToken(clientId, {
        access_token,
        refresh_token,
        token_type: "Bearer",
        expires_in,
      })

      const me = await spotifyApi.currentUser.profile()
      const userId = me.id
      const username = req.session.user?.username ?? me.display_name

      // Update session
      req.session.user = { userId, username }

      // Store tokens in new authentication store
      await storeUserServiceAuth({
        context,
        userId,
        serviceName: "spotify",
        tokens: {
          accessToken: access_token,
          refreshToken: refresh_token,
          expiresAt: Date.now() + expires_in * 1000,
        },
      })

      // Save user to Redis (if needed for backward compatibility)
      const userKey = `user:${userId}`
      await context.redis.pubClient.hSet(userKey, {
        userId,
        username,
        isAdmin: "true",
      })

      if (process.env.APP_URL) {
        const params = {
          toast: "Spotify authentication successful",
          userId,
        }

        res.redirect(`${process.env.APP_URL}${redirect ?? ""}?${querystring.stringify(params)}`)
      } else {
        res.send({ access_token, userId })
      }
    } catch (e) {
      console.error("Spotify auth error:", e)
      res.status(500).send({
        error: "Authentication failed",
      })
    }
  })

  return router
}

