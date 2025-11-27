import { Router, Request, Response } from "express"
import querystring from "querystring"
import { AppContext } from "@repo/types"
import { SpotifyApi } from "@spotify/web-api-ts-sdk"
import generateRandomString from "./generateRandomString"
import { storeUserServiceAuth } from "@repo/server/operations/data/serviceAuthentications"
import { storeUserChallenge } from "@repo/server/operations/userChallenge"

const stateKey = "spotify_auth_state"
const redirectKey = "after_spotify_auth_redirect"
const userIdKey = "spotify_auth_user_id"

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

    // Cookie options for cross-subdomain OAuth flow
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.ENVIRONMENT === "production",
      sameSite: "lax" as const,
      maxAge: 10 * 60 * 1000, // 10 minutes - enough for OAuth flow
    }

    // Validate userId - reject undefined/null/empty strings
    const requestUserId = req.query.userId
    const validUserId =
      requestUserId && requestUserId !== "undefined" && requestUserId !== "null"
        ? requestUserId
        : null

    console.log("[Spotify Auth] Setting OAuth cookies with options:", cookieOptions)
    console.log("[Spotify Auth] userId from request:", requestUserId, "-> valid:", validUserId)

    res.cookie(stateKey, state, cookieOptions)
    res.cookie(redirectKey, req.query.redirect || "/", cookieOptions)
    // Only set userId cookie if we have a valid one
    if (validUserId) {
      res.cookie(userIdKey, validUserId, cookieOptions)
    }

    const scope =
      "user-read-private user-read-email playlist-modify-public playlist-modify-private user-read-playback-state user-modify-playback-state user-read-currently-playing user-library-read user-library-modify"

    console.log("[Spotify Auth] Redirect URI being used:", redirectUri)
    console.log("[Spotify Auth] Client ID:", clientId?.substring(0, 8) + "...")

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
    const rawOriginalUserId = req.cookies ? req.cookies[userIdKey] : null

    // Validate originalUserId - treat "undefined" and "null" strings as null
    const originalUserId =
      rawOriginalUserId && rawOriginalUserId !== "undefined" && rawOriginalUserId !== "null"
        ? rawOriginalUserId
        : null

    console.log("[Spotify Auth] Callback received")
    console.log("[Spotify Auth] Cookies received:", Object.keys(req.cookies || {}))
    console.log(
      "[Spotify Auth] rawOriginalUserId from cookie:",
      rawOriginalUserId,
      "-> validated:",
      originalUserId,
    )
    console.log("[Spotify Auth] redirect from cookie:", redirect)
    console.log("[Spotify Auth] state match:", state === storedState)

    if (state === null || state !== storedState || !code) {
      console.log("[Spotify Auth] State mismatch or missing code")
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

      // Get user info from Spotify
      const spotifyApi = SpotifyApi.withAccessToken(clientId, {
        access_token,
        refresh_token,
        token_type: "Bearer",
        expires_in,
      })

      const me = await spotifyApi.currentUser.profile()
      const spotifyUserId = me.id

      // Use the original Radio Room user ID if provided, otherwise use Spotify ID
      // This ensures tokens are stored under the correct user identity
      const userId = originalUserId || spotifyUserId
      const username = req.session.user?.username ?? me.display_name

      console.log("[Spotify Auth] Spotify user ID:", spotifyUserId)
      console.log("[Spotify Auth] Original Radio Room user ID:", originalUserId)
      console.log("[Spotify Auth] Final userId for session:", userId)
      console.log("[Spotify Auth] Username:", username)

      // Clear the userId cookie
      res.clearCookie(userIdKey)

      // Update session
      req.session.user = { userId, username }
      console.log("[Spotify Auth] Session updated:", req.session.user)

      // Explicitly save session before any redirects
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("[Spotify Auth] Session save error:", err)
            reject(err)
          } else {
            console.log("[Spotify Auth] Session saved successfully")
            resolve()
          }
        })
      })

      // Store tokens in authentication store (under Radio Room user ID)
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

      // Generate and store challenge for room creation auth
      const challenge = generateRandomString(32)
      await storeUserChallenge({ userId, challenge }, context)

      if (process.env.APP_URL) {
        const params = {
          toast: "Spotify authentication successful",
          userId,
          challenge,
        }

        res.redirect(`${process.env.APP_URL}${redirect ?? ""}?${querystring.stringify(params)}`)
      } else {
        res.send({ access_token, userId, challenge })
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
