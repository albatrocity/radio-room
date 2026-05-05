import { z } from "zod"

export const guessTheTuneConfigSchema = z.object({
  enabled: z.boolean().default(false),
  matchTitle: z.boolean().default(true),
  matchArtist: z.boolean().default(true),
  matchAlbum: z.boolean().default(true),
  pointsTitle: z.number().int().min(0).default(5),
  pointsArtist: z.number().int().min(0).default(2),
  pointsAlbum: z.number().int().min(0).default(3),
  speedMultiplier: z.number().min(1).default(2),
  speedMultiplierWindowSec: z.number().int().min(0).default(20),
  showNowPlayingToAdmins: z.boolean().default(true),
  fuzzyThreshold: z.number().min(0).max(1).default(0.35),
  soundEffectOnMatch: z.boolean().default(true),
  soundEffectOnMatchUrl: z
    .url()
    .optional()
    .default("https://ross-brown.s3.amazonaws.com/broadcast/correct.mp3"),
  messageTemplate: z
    .string()
    .default(
      "{{username}} identified the {{propertyLabel}}! +{{points}} points{{multiplierSuffix}}",
    ),
  showLeaderboard: z.boolean().default(true),
})

export type GuessTheTuneConfig = z.infer<typeof guessTheTuneConfigSchema>

export const defaultGuessTheTuneConfig: GuessTheTuneConfig = {
  enabled: false,
  matchTitle: true,
  matchArtist: true,
  matchAlbum: true,
  pointsTitle: 5,
  pointsArtist: 2,
  pointsAlbum: 3,
  speedMultiplier: 2,
  speedMultiplierWindowSec: 20,
  showNowPlayingToAdmins: true,
  fuzzyThreshold: 0.35,
  soundEffectOnMatch: true,
  soundEffectOnMatchUrl: "https://ross-brown.s3.amazonaws.com/broadcast/correct.mp3",
  messageTemplate:
    "{{username}} identified the {{propertyLabel}}! +{{points}} points{{multiplierSuffix}}",
  showLeaderboard: true,
}

export type GuessProperty = "title" | "artist" | "album"
