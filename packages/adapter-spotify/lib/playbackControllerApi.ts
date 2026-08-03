import {
  PlaybackControllerLifecycleCallbacks,
  PlaybackControllerApi,
  PlaybackControllerQueueItem,
} from "@repo/types"
import { AccessToken, SpotifyApi } from "@spotify/web-api-ts-sdk"
import { trackItemSchema } from "./schemas"

function clampVolumePercent(volumePercent: number): number {
  return Math.round(Math.max(0, Math.min(100, volumePercent)))
}

function isSpotifyEmptyBodySuccess(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("JSON") || message.includes("Unexpected")
}

/** Must match Spotify.Player name in apps/bridge-daemon/static/spotify.html */
const BRIDGE_SPOTIFY_DEVICE_NAME = "Listening Room Bridge"

function isDeviceNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes("Device not found") || message.includes("404")
}

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

  /**
   * Prefer the bridge SDK device when advertised; wake it via transferPlayback.
   *
   * The Web Playback SDK `ready` device_id frequently differs from the id in
   * GET /me/player/devices for the same player — match by Connect name when
   * the preferred id is missing/stale. Transfer by preferred id only as a last
   * resort when the device is not listed yet.
   */
  async function resolveTargetDevice(api: SpotifyApi): Promise<{ id: string }> {
    try {
      const preferredId = (await config.getPreferredDeviceId?.()) ?? null
      if (!preferredId) {
        return getNowPlayingDevice(api)
      }

      const { devices } = await api.player.getAvailableDevices()
      const byId = devices.find((d) => d.id === preferredId)
      const byName = devices.find((d) => d.name === BRIDGE_SPOTIFY_DEVICE_NAME)
      const target = byId ?? byName

      if (target?.id) {
        if (!byId && byName?.id && byName.id !== preferredId) {
          console.log(
            `[spotify] preferred id ${preferredId} ≠ listed "${BRIDGE_SPOTIFY_DEVICE_NAME}" ${byName.id}; using listed`,
          )
        }
        if (!target.is_active) {
          try {
            await api.player.transferPlayback([target.id], false)
          } catch (error: unknown) {
            if (!isSpotifyEmptyBodySuccess(error)) {
              console.warn(
                `[spotify] transfer to ${target.id} failed; targeting anyway:`,
                error,
              )
            }
          }
        }
        return { id: target.id }
      }

      try {
        await api.player.transferPlayback([preferredId], false)
        console.log(
          `[spotify] preferred device ${preferredId} not listed; transferred by id`,
        )
        return { id: preferredId }
      } catch (error: unknown) {
        if (isSpotifyEmptyBodySuccess(error)) {
          return { id: preferredId }
        }
        if (isDeviceNotFoundError(error)) {
          console.warn(
            `[spotify] preferred device ${preferredId} not found (404); falling back`,
          )
        } else {
          throw error
        }
      }
    } catch (e) {
      console.warn("[spotify] preferred device resolution failed; falling back:", e)
    }
    return getNowPlayingDevice(api)
  }

  const api: PlaybackControllerApi = {
    async play() {
      const api = await getSpotifyApi()
      const device = await resolveTargetDevice(api)

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
      const device = await resolveTargetDevice(api)

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
      const device = await resolveTargetDevice(api)

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
      const device = await resolveTargetDevice(api)

      try {
        await api.player.seekToPosition(position, device.id)
      } catch (error: unknown) {
        // Spotify returns 204 No Content on success; the SDK still tries to JSON-parse the body.
        if (!isSpotifyEmptyBodySuccess(error)) {
          throw error
        }
      }
      await config.onPlaybackPositionChange?.(position)
    },
    async skipToNextTrack() {
      const api = await getSpotifyApi()
      const device = await resolveTargetDevice(api)

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
      const device = await resolveTargetDevice(api)

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
    async setVolume(volumePercent) {
      const api = await getSpotifyApi()
      const device = await resolveTargetDevice(api)

      try {
        await api.player.setPlaybackVolume(clampVolumePercent(volumePercent), device.id)
      } catch (error: unknown) {
        if (!isSpotifyEmptyBodySuccess(error)) {
          throw error
        }
      }
    },
    async getPlayback() {
      const api = await getSpotifyApi()
      const playback = await api.player.getPlaybackState()
      // Spotify returns null body when nothing is playing / no active device context
      if (!playback) {
        return {
          state: "paused" as const,
          track: null,
          progressMs: null,
          durationMs: null,
          volumePercent: null,
        }
      }

      const { is_playing, item, progress_ms, device } = playback
      const durationMs =
        item && typeof item === "object" && "duration_ms" in item
          ? (item as { duration_ms?: number }).duration_ms ?? null
          : null
      const volumePercent =
        device && typeof device === "object" && typeof device.volume_percent === "number"
          ? device.volume_percent
          : null

      return {
        state: is_playing ? "playing" : "paused",
        track: item ? trackItemSchema.parse(item) : null,
        progressMs: progress_ms ?? null,
        durationMs,
        volumePercent,
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
