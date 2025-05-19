import { describe, it, expect } from "vitest"
import { z } from "zod"
import { trackItemSchema } from "./schemas"

describe("trackItemSchema", () => {
  // Test fixture - valid Spotify track data
  const validTrack = {
    album: {
      id: "album123",
      name: "Test Album",
      images: [
        { url: "https://example.com/image1.jpg", height: 300, width: 300 },
        { url: "https://example.com/image2.jpg", height: 64, width: 64 },
      ],
      artists: [{ id: "artist1", name: "Album Artist", uri: "spotify:artist:artist1" }],
      release_date: "2023-01-01",
      release_date_precision: "day",
      total_tracks: 12,
      uri: "spotify:album:album123",
    },
    artists: [
      { id: "artist1", name: "Main Artist", uri: "spotify:artist:artist1" },
      { id: "artist2", name: "Featured Artist", uri: "spotify:artist:artist2" },
    ],
    duration_ms: 217000,
    explicit: false,
    id: "track123",
    name: "Test Track",
    popularity: 75,
    track_number: 3,
    disc_number: 1,
    preview_url: "https://example.com/preview.mp3",
    uri: "spotify:track:track123",
    is_local: false,
    external_urls: {
      spotify: "https://open.spotify.com/track/track123",
    },
  }

  it("validates a valid Spotify track", () => {
    expect(() => trackItemSchema.parse(validTrack)).not.toThrow()
  })

  it("transforms track to PlaybackControllerQueueItem format", () => {
    const result = trackItemSchema.parse(validTrack)

    // Verify essential properties match expected values
    expect(result).toEqual(
      expect.objectContaining({
        id: validTrack.id,
        title: validTrack.name,
        duration: validTrack.duration_ms,
        explicit: validTrack.explicit,
      }),
    )

    // Check URLs transformation
    expect(result.urls).toHaveLength(2)
    expect(result.urls[0]).toEqual({
      type: "resource",
      url: validTrack.uri,
      id: validTrack.uri,
    })
    expect(result.urls[1]).toEqual({
      type: "resource",
      url: validTrack.external_urls.spotify,
      id: "spotify_url",
    })

    // Check artists transformation
    expect(result.artists).toHaveLength(2)
    expect(result.artists[0].id).toBe(validTrack.artists[0].id)
    expect(result.artists[0].title).toBe(validTrack.artists[0].name)

    // Check album transformation
    expect(result.album.id).toBe(validTrack.album.id)
    expect(result.album.title).toBe(validTrack.album.name)
    expect(result.album.releaseDate).toBe(validTrack.album.release_date)
    expect(result.album.releaseDatePrecision).toBe(validTrack.album.release_date_precision)

    // Check image transformation
    expect(result.images[0]).toEqual({
      type: "image",
      url: validTrack.album.images[0].url,
      id: "300x300",
    })
  })

  it("handles missing optional fields", () => {
    const trackWithoutOptionals = {
      ...validTrack,
      popularity: undefined,
      is_local: undefined,
      external_urls: undefined,
    }

    const result = trackItemSchema.parse(trackWithoutOptionals)

    expect(result.popularity).toBe(0)
    expect(result.urls).toHaveLength(1)
    expect(result.urls[0].url).toBe(validTrack.uri)
  })

  it("handles null values in images", () => {
    const trackWithNullImageDimensions = {
      ...validTrack,
      album: {
        ...validTrack.album,
        images: [{ url: "https://example.com/image.jpg", height: null, width: null }],
      },
    }

    const result = trackItemSchema.parse(trackWithNullImageDimensions)

    expect(result.images[0].id).toBe("0x0")
    expect(result.album.images[0].id).toBe("0x0")
  })

  it("rejects invalid track data", () => {
    // Missing required field
    expect(() => trackItemSchema.parse({ ...validTrack, id: undefined })).toThrow(z.ZodError)

    // Invalid enum value
    expect(() =>
      trackItemSchema.parse({
        ...validTrack,
        album: {
          ...validTrack.album,
          release_date_precision: "invalid",
        },
      }),
    ).toThrow(z.ZodError)

    // Wrong type
    expect(() =>
      trackItemSchema.parse({
        ...validTrack,
        duration_ms: "217000", // String instead of number
      }),
    ).toThrow(z.ZodError)
  })
})
