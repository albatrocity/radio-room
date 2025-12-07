import { tidalTokenResponseSchema } from "../schemas"

interface RefreshResult {
  accessToken: string
  refreshToken: string
  expiresIn: number
}

/**
 * Refresh Tidal access token using the refresh token
 */
export async function refreshTidalAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<RefreshResult> {
  const response = await fetch("https://auth.tidal.com/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(clientId + ":" + clientSecret).toString("base64"),
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    
    // Check for invalid_user_grant - this means the refresh token is no longer valid
    // and the user needs to re-authenticate
    if (errorText.includes("invalid_user_grant")) {
      throw new Error(`Tidal refresh token is invalid - user needs to re-authenticate. Details: ${errorText}`)
    }
    
    throw new Error(`Failed to refresh Tidal token: ${response.status} - ${errorText}`)
  }

  const data = await response.json()
  const parsed = tidalTokenResponseSchema.safeParse(data)

  if (!parsed.success) {
    throw new Error("Invalid token response from Tidal refresh")
  }

  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token ?? refreshToken, // Keep old refresh token if new one not provided
    expiresIn: parsed.data.expires_in,
  }
}

