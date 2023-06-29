import ky, { HTTPError } from "ky"
import { SpotifyTrack } from "../../types/SpotifyTrack"
const baseEndpoint = `https://api.spotify.com/v1`
const searchEndpoint = `${baseEndpoint}/search`
const meEndpoint = `${baseEndpoint}/me`

function generateHeaders(accessToken: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
  }
}

export type SpotifyApiTracksResponse = {
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
    const results: SpotifyApiTracksResponse = await ky
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

export async function savedTracks({ accessToken }: { accessToken: string }) {
  try {
    const results: SpotifyApiTracksResponse = await ky
      .get(`${meEndpoint}/tracks`, {
        searchParams: {
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
