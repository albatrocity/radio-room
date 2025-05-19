import { AdapterConfig } from "@repo/types"

export async function getSpotifyApi(config: AdapterConfig) {
  const { type } = config.authentication
  if (type !== "token") {
    throw new Error("Invalid authentication type")
  }

  const { getStoredTokens, clientId } = config.authentication

  try {
    const { accessToken, refreshToken } = await getStoredTokens()
    if (!accessToken) {
      throw new Error("No access token provided for Spotify")
    }

    return {
      token: {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "Bearer",
        expires_in: 3600,
      },
      clientId,
      config,
    }
  } catch (error) {
    throw new Error("Failed to get stored tokens for Spotify")
  }
}
