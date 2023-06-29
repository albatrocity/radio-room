import ky, { HTTPError } from "ky"
import { SpotifyTrack } from "../../types/SpotifyTrack"
const searchEndpoint = `https://api.spotify.com/v1/search`

function generateHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

export type SpotifyApiSearchResponse = {
  tracks: {
    items: SpotifyTrack[]
    total: number
    offset: number
    next: string | undefined
    previous: string | undefined
    limit: number
  }
}

export async function search({
  query,
  accessToken,
}: {
  query: string
  accessToken: string
}) {
  try {
    const results: SpotifyApiSearchResponse = await ky
      .get(searchEndpoint, {
        searchParams: {
          q: query,
          type: "track",
          limit: 20,
        },
        headers: generateHeaders(accessToken),
      })
      .json()
    return results
  } catch (e: HTTPError | any) {
    if (e.name === "HTTPError") {
      const errorJson = await e.response.json()
      throw new Error(errorJson.message)
    }
  }
}
