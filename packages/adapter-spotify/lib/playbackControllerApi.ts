import {
  PlaybackControllerLifecycleCallbacks,
  PlaybackControllerApi,
  PlaybackControllerQueueItem,
} from "@repo/types"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"
import { trackItemSchema } from "./schemas"

export async function makeApi({
  token,
  clientId,
  config,
}: {
  token: AccessToken
  clientId: string
  config: PlaybackControllerLifecycleCallbacks
}) {
  // Helper function to get fresh SpotifyApi instance with current tokens
  const getSpotifyApi = async (): Promise<SpotifyApi> => {
    // Fetch fresh tokens from storage
    if (config.authentication.type !== "oauth") {
      throw new Error("OAuth authentication required")
    }
    const tokens = await config.authentication.getStoredTokens()
    const freshToken: AccessToken = {
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      token_type: "Bearer",
      expires_in: 3600,
    }
    return SpotifyApi.withAccessToken(clientId, freshToken)
  }

  // Initial validation
  const spotifyApi = await getSpotifyApi()
  const accessToken = await spotifyApi.getAccessToken()

  if (!accessToken) {
    const error = new Error("Failed to get access token")
    await config.onAuthenticationFailed?.(error)
    throw error
  }

  config.onAuthenticationCompleted?.({
    accessToken: accessToken.access_token,
    refreshToken: accessToken.refresh_token,
    expiresIn: accessToken.expires_in,
  })

  const api: PlaybackControllerApi = {
    async play() {
      const api = await getSpotifyApi()
      const device = await getNowPlayingDevice(api)

      try {
        await api.player.startResumePlayback(device.id)
      } catch (error: any) {
        // Spotify returns 204 No Content on success; SDK may throw JSON parse errors on empty body
        if (!(error.message?.includes("JSON") || error.message?.includes("Unexpected"))) {
          throw error
        }
      }
      await config.onPlay?.()
      await config.onPlaybackStateChange?.("playing")
    },
    async playTrack(mediaId) {
      const api = await getSpotifyApi()
      const device = await getNowPlayingDevice(api)

      try {
        await api.player.startResumePlayback(device.id, undefined, [mediaId], undefined, 0)
      } catch (error: any) {
        if (error.message?.includes("JSON") || error.message?.includes("Unexpected")) {
          // Spotify returns empty body on success sometimes
        } else {
          throw error
        }
      }

      await config.onPlay?.()
      await config.onPlaybackStateChange?.("playing")
    },
    async pause() {
      const api = await getSpotifyApi()
      const device = await getNowPlayingDevice(api)

      try {
        await api.player.pausePlayback(device.id)
      } catch (error: any) {
        if (!(error.message?.includes("JSON") || error.message?.includes("Unexpected"))) {
          throw error
        }
      }
      await config.onPause?.()
      await config.onPlaybackStateChange?.("paused")
    },
    async seekTo(position) {
      const api = await getSpotifyApi()
      await api.player.seekToPosition(position)
      await config.onPlaybackPositionChange?.(position)
    },
    async skipToNextTrack() {
      const api = await getSpotifyApi()
      const device = await getNowPlayingDevice(api)

      try {
        await api.player.skipToNext(device.id)
      } catch (error: any) {
        // Spotify returns 204 No Content on success, which the SDK tries to parse as JSON
        // This causes a JSON parse error even though the operation succeeded
        if (error.message?.includes("JSON") || error.message?.includes("Unexpected")) {
          // Treat JSON parse errors as success since Spotify returns empty body on 204
          console.log("Track successfully skipped (ignored JSON parse error from 204 response)")
        } else {
          // Re-throw actual errors
          throw error
        }
      }

      const nowPlaying = await api.player.getCurrentlyPlayingTrack()
      await config.onChangeTrack?.(trackItemSchema.parse(nowPlaying.item))

      return await getQueue(api)
    },
    async skipToPreviousTrack() {
      const api = await getSpotifyApi()
      const device = await getNowPlayingDevice(api)

      await api.player.skipToPrevious(device.id)

      const nowPlaying = await api.player.getCurrentlyPlayingTrack()
      await config.onChangeTrack?.(trackItemSchema.parse(nowPlaying.item))

      return await getQueue(api)
    },
    async getQueue() {
      const api = await getSpotifyApi()
      return await getQueue(api)
    },
    async addToQueue(mediaId, position) {
      const api = await getSpotifyApi()
      // mediaId should be the Spotify URI (spotify:track:xxx or spotify:episode:xxx)
      // provided by the track metadata

      try {
        await api.player.addItemToPlaybackQueue(mediaId)
      } catch (error: any) {
        // Spotify returns 204 No Content on success, which the SDK tries to parse as JSON
        // This causes a JSON parse error even though the operation succeeded
        if (error.message?.includes("JSON") || error.message?.includes("Unexpected")) {
          // Treat JSON parse errors as success since Spotify returns empty body on 204
          console.log(
            "Track successfully added to queue (ignored JSON parse error from 204 response)",
          )
        } else {
          // Re-throw actual errors
          throw error
        }
      }

      const queue = await getQueue(api)
      await config.onPlaybackQueueChange?.(queue)
      return queue
    },
    async getPlayback() {
      const api = await getSpotifyApi()
      const playback = await api.player.getPlaybackState()
      // Spotify returns null body when nothing is playing / no active device context
      if (!playback) {
        return {
          state: "paused" as const,
          track: null,
        }
      }

      const { is_playing, item } = playback

      return {
        state: is_playing ? "playing" : "paused",
        track: item ? trackItemSchema.parse(item) : null,
      }
    },
  }

  return api
}

async function getNowPlayingDevice(spotifyApi: SpotifyApi) {
  const playback = await spotifyApi.player.getPlaybackState()
  if (!playback) {
    throw new Error("No active device found")
  }

  const { device } = playback

  if (!device?.id) {
    throw new Error("No active device found")
  }

  // Guarantee the device ID
  return {
    ...device,
    id: device.id,
  }
}

async function getQueue(spotifyApi: SpotifyApi): Promise<PlaybackControllerQueueItem[]> {
  const { queue } = await spotifyApi.player.getUsersQueue()

  return queue.map((item) => trackItemSchema.parse(item))
}
