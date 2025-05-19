import { z } from "zod"
import { PlaybackControllerQueueItem } from "@repo/types"

export const trackItemSchema = z
  .object({
    album: z.object({
      id: z.string(),
      name: z.string(),
      images: z.array(
        z.object({
          url: z.string(),
          height: z.number().nullable(),
          width: z.number().nullable(),
        }),
      ),
      artists: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          uri: z.string(),
        }),
      ),
      release_date: z.string(),
      release_date_precision: z.enum(["day", "month", "year"]),
      total_tracks: z.number(),
      uri: z.string(),
    }),
    artists: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        uri: z.string(),
      }),
    ),
    duration_ms: z.number(),
    explicit: z.boolean(),
    id: z.string(),
    name: z.string(),
    popularity: z.number().optional(),
    track_number: z.number(),
    disc_number: z.number(),
    preview_url: z.string().nullable(),
    uri: z.string(),
    is_local: z.boolean().optional(),
    external_urls: z
      .object({
        spotify: z.string(),
      })
      .optional(),
  })
  .transform((track): PlaybackControllerQueueItem => {
    return {
      id: track.id,
      title: track.name,
      urls: [
        {
          type: "resource",
          url: track.uri,
          id: track.uri,
        },
        ...(track.external_urls?.spotify
          ? [
              {
                type: "resource" as const,
                url: track.external_urls.spotify,
                id: "spotify_url",
              },
            ]
          : []),
      ],
      artists: track.artists.map((artist) => ({
        id: artist.id,
        title: artist.name,
        urls: [
          {
            type: "resource",
            url: artist.uri,
            id: artist.uri,
          },
        ],
      })),
      album: {
        id: track.album.id,
        title: track.album.name,
        urls: [
          {
            type: "resource",
            url: track.album.uri,
            id: track.album.uri,
          },
        ],
        artists: track.album.artists.map((artist) => ({
          id: artist.id,
          title: artist.name,
          urls: [
            {
              type: "resource",
              url: artist.uri,
              id: artist.uri,
            },
          ],
        })),
        releaseDate: track.album.release_date,
        releaseDatePrecision: track.album.release_date_precision as
          | "day"
          | "month"
          | "year",
        totalTracks: track.album.total_tracks,
        label: "",
        images: track.album.images.map((image) => ({
          type: "image",
          url: image.url,
          id: `${image.width || 0}x${image.height || 0}`,
        })),
      },
      duration: track.duration_ms,
      explicit: track.explicit,
      trackNumber: track.track_number,
      discNumber: track.disc_number,
      popularity: track.popularity || 0,
      images: track.album.images.map((image) => ({
        type: "image",
        url: image.url,
        id: `${image.width || 0}x${image.height || 0}`,
      })),
    }
  })
