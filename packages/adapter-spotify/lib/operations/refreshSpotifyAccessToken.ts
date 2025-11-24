/**
 * Refresh Spotify access token using a refresh token
 * Calls Spotify's token endpoint to get new tokens
 */
export async function refreshSpotifyAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<{
  accessToken: string
  refreshToken: string
  expiresIn: number
}> {
  const response = await fetch("https://accounts.spotify.com/api/token", {
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
    const error = await response.text()
    throw new Error(`Failed to refresh Spotify token: ${response.status} ${error}`)
  }

  const data = (await response.json()) as {
    access_token: string
    refresh_token?: string
    expires_in: number
    token_type: string
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken, // Spotify may not return a new refresh token
    expiresIn: data.expires_in,
  }
}

