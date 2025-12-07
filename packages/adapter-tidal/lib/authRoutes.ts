import { Router, Request, Response } from "express"
import querystring from "querystring"
import crypto from "crypto"
import { AppContext } from "@repo/types"
import generateRandomString from "./generateRandomString"
import { storeUserServiceAuth } from "@repo/server/operations/data/serviceAuthentications"
import { storeUserChallenge } from "@repo/server/operations/userChallenge"
import { tidalTokenResponseSchema } from "./schemas"

const stateKey = "tidal_auth_state"
const redirectKey = "after_tidal_auth_redirect"
const userIdKey = "tidal_auth_user_id"
const codeVerifierKey = "tidal_code_verifier"

/**
 * Generate a PKCE code verifier (43-128 characters, URL-safe)
 */
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString("base64url")
}

/**
 * Generate a PKCE code challenge from a verifier using SHA256
 */
function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url")
}

type ReqQuery = {
  userId?: string
  roomTitle?: string
  redirect?: string
}

/**
 * Create Express routes for Tidal OAuth authentication
 */
export function createTidalAuthRoutes(context: AppContext) {
  const router = Router()

  const clientId = process.env.TIDAL_CLIENT_ID
  const clientSecret = process.env.TIDAL_CLIENT_SECRET
  const redirectUri = process.env.TIDAL_REDIRECT_URI

  // If Tidal credentials are not configured, return routes that inform the user
  if (!clientId || !clientSecret || !redirectUri) {
    console.warn("[Tidal Auth] Tidal OAuth not configured - TIDAL_CLIENT_ID, TIDAL_CLIENT_SECRET, or TIDAL_REDIRECT_URI missing")
    
    router.get("/login", (req: Request, res: Response) => {
      res.status(503).json({
        error: "Tidal authentication not configured",
        message: "Tidal OAuth credentials are not set on this server",
      })
    })
    
    router.get("/callback", (req: Request, res: Response) => {
      res.status(503).json({
        error: "Tidal authentication not configured",
        message: "Tidal OAuth credentials are not set on this server",
      })
    })
    
    return router
  }

  /**
   * Initiate Tidal OAuth flow with PKCE
   * GET /auth/tidal/login
   */
  router.get("/login", async (req: Request<any, any, any, ReqQuery>, res: Response) => {
    const state = generateRandomString(16)
    
    // Generate PKCE code verifier and challenge
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

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

    console.log("[Tidal Auth] Setting OAuth cookies with options:", cookieOptions)
    console.log("[Tidal Auth] userId from request:", requestUserId, "-> valid:", validUserId)
    console.log("[Tidal Auth] PKCE code_challenge generated")

    res.cookie(stateKey, state, cookieOptions)
    res.cookie(redirectKey, req.query.redirect || "/", cookieOptions)
    res.cookie(codeVerifierKey, codeVerifier, cookieOptions) // Store verifier for token exchange
    // Only set userId cookie if we have a valid one
    if (validUserId) {
      res.cookie(userIdKey, validUserId, cookieOptions)
    }

    // Tidal OAuth scopes
    // - search.read: Required for search functionality
    // - collection.read/write: Required for library operations (save tracks)
    // - user.read: Required to get user ID
    // - playlists.read/write: Required for playlist creation
    const scope = "search.read collection.read collection.write user.read playlists.read playlists.write"

    console.log("[Tidal Auth] Redirect URI being used:", redirectUri)
    console.log("[Tidal Auth] Client ID:", clientId?.substring(0, 8) + "...")

    res.redirect(
      "https://login.tidal.com/authorize?" +
        querystring.stringify({
          response_type: "code",
          client_id: clientId,
          scope: scope,
          redirect_uri: redirectUri,
          state: state,
          code_challenge: codeChallenge,
          code_challenge_method: "S256",
        }),
    )
  })

  /**
   * Handle Tidal OAuth callback
   * GET /auth/tidal/callback
   */
  router.get("/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string | null
    const state = req.query.state as string | null
    const error = req.query.error as string | null
    const errorDescription = req.query.error_description as string | null

    const storedState = req.cookies ? req.cookies[stateKey] : null
    const redirect = req.cookies ? req.cookies[redirectKey] : null
    const rawOriginalUserId = req.cookies ? req.cookies[userIdKey] : null
    const codeVerifier = req.cookies ? req.cookies[codeVerifierKey] : null

    // Validate originalUserId - treat "undefined" and "null" strings as null
    const originalUserId =
      rawOriginalUserId && rawOriginalUserId !== "undefined" && rawOriginalUserId !== "null"
        ? rawOriginalUserId
        : null

    console.log("[Tidal Auth] Callback received")
    console.log("[Tidal Auth] Query params:", { code: code ? "present" : "missing", state, error, errorDescription })
    console.log("[Tidal Auth] Cookies received:", Object.keys(req.cookies || {}))
    console.log("[Tidal Auth] PKCE code_verifier present:", !!codeVerifier)
    console.log(
      "[Tidal Auth] rawOriginalUserId from cookie:",
      rawOriginalUserId,
      "-> validated:",
      originalUserId,
    )
    console.log("[Tidal Auth] redirect from cookie:", redirect)
    console.log("[Tidal Auth] state match:", state === storedState)

    // Check if Tidal returned an error
    if (error) {
      console.log("[Tidal Auth] Tidal returned error:", error, errorDescription)
      const appUrl = process.env.APP_URL || ""
      res.redirect(
        `${appUrl}${redirect || "/"}?` +
          querystring.stringify({
            error: `tidal_${error}`,
            message: errorDescription || error,
          }),
      )
      return
    }

    if (state === null || state !== storedState) {
      console.log("[Tidal Auth] State mismatch - stored:", storedState, "received:", state)
      res.redirect(
        "/#" +
          querystring.stringify({
            error: "state_mismatch",
          }),
      )
      return
    }

    if (!code) {
      console.log("[Tidal Auth] No authorization code received from Tidal")
      res.redirect(
        "/#" +
          querystring.stringify({
            error: "no_code",
          }),
      )
      return
    }

    if (!codeVerifier) {
      console.log("[Tidal Auth] No PKCE code verifier found in cookies")
      res.redirect(
        "/#" +
          querystring.stringify({
            error: "missing_code_verifier",
          }),
      )
      return
    }

    res.clearCookie(stateKey)
    res.clearCookie(codeVerifierKey)

    try {
      // Exchange code for tokens using PKCE
      const tokenResponse = await fetch("https://auth.tidal.com/v1/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
        },
        body: new URLSearchParams({
          code,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
          code_verifier: codeVerifier,
        }),
      })

      const tokenDataRaw = await tokenResponse.json()
      const tokenParsed = tidalTokenResponseSchema.safeParse(tokenDataRaw)

      if (!tokenParsed.success) {
        console.error("[Tidal Auth] Failed to parse token response:", tokenParsed.error)
        throw new Error("Invalid token response from Tidal")
      }

      const { access_token, refresh_token, expires_in } = tokenParsed.data

      // Get user info from Tidal
      const userResponse = await fetch("https://openapi.tidal.com/v2/users/me", {
        headers: {
          Authorization: `Bearer ${access_token}`,
          Accept: "application/vnd.api+json",
        },
      })

      let tidalUserId: string
      let username: string

      if (userResponse.ok) {
        const userData = (await userResponse.json()) as {
          data?: { id?: string; attributes?: { username?: string; firstName?: string } }
        }
        tidalUserId = userData.data?.id ?? generateRandomString(12)
        username = userData.data?.attributes?.username ?? userData.data?.attributes?.firstName ?? "Tidal User"
      } else {
        // If user info fails, generate a placeholder ID
        tidalUserId = generateRandomString(12)
        username = "Tidal User"
      }

      // Use the original Radio Room user ID if provided, otherwise use Tidal ID
      const userId = originalUserId || tidalUserId

      console.log("[Tidal Auth] Tidal user ID:", tidalUserId)
      console.log("[Tidal Auth] Original Radio Room user ID:", originalUserId)
      console.log("[Tidal Auth] Final userId for session:", userId)
      console.log("[Tidal Auth] Username:", username)

      // Clear the userId cookie
      res.clearCookie(userIdKey)

      // Update session
      req.session.user = { userId, username }
      console.log("[Tidal Auth] Session updated:", req.session.user)

      // Explicitly save session before any redirects
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) {
            console.error("[Tidal Auth] Session save error:", err)
            reject(err)
          } else {
            console.log("[Tidal Auth] Session saved successfully")
            resolve()
          }
        })
      })

      // Store tokens in authentication store (under Radio Room user ID)
      await storeUserServiceAuth({
        context,
        userId,
        serviceName: "tidal",
        tokens: {
          accessToken: access_token,
          refreshToken: refresh_token ?? "",
          expiresAt: Date.now() + expires_in * 1000,
          // Store Tidal user ID for library operations
          metadata: { tidalUserId },
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
          toast: "Tidal authentication successful",
          userId,
          challenge,
        }

        res.redirect(`${process.env.APP_URL}${redirect ?? ""}?${querystring.stringify(params)}`)
      } else {
        res.send({ access_token, userId, challenge })
      }
    } catch (e) {
      console.error("Tidal auth error:", e)
      res.status(500).send({
        error: "Authentication failed",
      })
    }
  })

  return router
}

