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

export type SpotifyApiPlaylistResult = {
  collaborative: boolean
  description: string
  external_urls: {
    spotify: string
  }
  href: string
  id: string
  name: string
  uri: string
}

export type SpotifyApiMeResults = {
  id: string
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

export async function createAndPopulatePlaylist({
  accessToken,
  name,
  uris,
}: {
  accessToken: string
  name: string
  uris: string[]
}) {
  try {
    const me: SpotifyApiMeResults = await ky
      .get(meEndpoint, {
        headers: generateHeaders(accessToken),
      })
      .json()

    if (!me.id) {
      throw new Error("No user ID found")
    }

    const playlist: SpotifyApiPlaylistResult = await ky(
      `${baseEndpoint}/users/${me.id}/playlists`,
      {
        method: "POST",
        headers: generateHeaders(accessToken),
        json: {
          name,
        },
      },
    ).json()

    await ky(`${baseEndpoint}/playlists/${playlist.id}/tracks`, {
      method: "POST",
      headers: generateHeaders(accessToken),
      json: {
        uris,
      },
    }).json()

    return playlist
  } catch (e: HTTPError | any) {
    if (e.name === "HTTPError") {
      const errorJson = await e.response.json()
      throw new Error(errorJson.message)
    }
  }
}
