import {
  PlaybackControllerAdapterConfig,
  PlaybackControllerApi,
  PlaybackControllerQueueItem,
} from "@repo/types"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"
import { trackItemSchema } from "./schemas"

export async function getSpotifyApi(config: PlaybackControllerAdapterConfig) {
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

    const spotifyApi = await makeApi({
      accessToken: {
        access_token: accessToken,
        token_type: "Bearer",
        refresh_token: refreshToken,
        expires_in: 3600,
      },
      clientId,
      config,
    })

    return spotifyApi
  } catch (error) {
    throw new Error("Failed to get stored tokens for Spotify")
  }
}

export async function makeApi({
  accessToken,
  clientId,
  config,
}: {
  accessToken: AccessToken
  clientId: string
  config: PlaybackControllerAdapterConfig
}) {
  const spotifyApi = SpotifyApi.withAccessToken(clientId, accessToken)

  const token = await spotifyApi.getAccessToken()

  if (!token) {
    const error = new Error("Failed to get access token")
    await config.onAuthenticationFailed(error)
    throw error
  }

  config.onAuthenticationCompleted({
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresIn: token.expires_in,
  })

  const api: PlaybackControllerApi = {
    async play() {
      const device = await getNowPlayingDevice(spotifyApi)

      await spotifyApi.player.startResumePlayback(device.id)
      await config.onPlay()
      await config.onPlaybackStateChange("playing")
    },
    async pause() {
      const device = await getNowPlayingDevice(spotifyApi)

      await spotifyApi.player.pausePlayback(device.id)
      await config.onPause()
      await config.onPlaybackStateChange("paused")
    },
    async seekTo(position) {
      await spotifyApi.player.seekToPosition(position)
      await config.onPlaybackPositionChange(position)
    },
    async skipToNextTrack() {
      const device = await getNowPlayingDevice(spotifyApi)

      await spotifyApi.player.skipToNext(device.id)

      const nowPlaying = await spotifyApi.player.getCurrentlyPlayingTrack()
      await config.onChangeTrack(trackItemSchema.parse(nowPlaying.item))

      return await getQueue(spotifyApi)
    },
    async skipToPreviousTrack() {
      const device = await getNowPlayingDevice(spotifyApi)

      await spotifyApi.player.skipToPrevious(device.id)

      const nowPlaying = await spotifyApi.player.getCurrentlyPlayingTrack()
      await config.onChangeTrack(trackItemSchema.parse(nowPlaying.item))

      return await getQueue(spotifyApi)
    },
    async getQueue() {
      return await getQueue(spotifyApi)
    },
    async addToQueue(mediaId, position) {
      await spotifyApi.player.addItemToPlaybackQueue(mediaId)

      const queue = await getQueue(spotifyApi)
      await config.onPlaybackQueueChange(queue)
      return queue
    },
    async getPlayback() {
      const { is_playing, item } = await spotifyApi.player.getPlaybackState()

      return {
        state: is_playing ? "playing" : "paused",
        track: item ? trackItemSchema.parse(item) : null,
      }
    },
  }

  return api
}

async function getNowPlayingDevice(spotifyApi: SpotifyApi) {
  const { device } = await spotifyApi.player.getPlaybackState()

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
