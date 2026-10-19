import type { PluginFactory } from "@repo/types"
import createPlaylistDemocracyPlugin from "@repo/plugin-playlist-democracy"
import createSpecialWordsPlugin from "@repo/plugin-special-words"
import createAbsentDjPlugin from "@repo/plugin-absent-dj"
import createQueueHygienePlugin from "@repo/plugin-queue-hygiene"
import createGuessTheTunePlugin from "@repo/plugin-guess-the-tune"
import createItemShopsPlugin from "@repo/plugin-item-shops"
import createLoyaltyProgramPlugin from "@repo/plugin-loyalty-program"
import createQueuePacerPlugin from "@repo/plugin-queue-pacer"
import createQuizSessionsPlugin from "@repo/plugin-quiz-sessions"
import createPlaylistBingoPlugin from "@repo/plugin-playlist-bingo"
import createRoundRobinDjPlugin from "@repo/plugin-round-robin-dj"
import createMusicUploadPlugin from "@repo/plugin-music-upload"
import createVolumeManagerPlugin from "@repo/plugin-volume-manager"
import createQueueThemePlugin from "@repo/plugin-queue-theme"
import createTheFedPlugin from "@repo/plugin-the-fed"
import createLyricHeroPlugin from "@repo/plugin-lyric-hero"
import createRoadTripPlugin from "@repo/plugin-road-trip"

/**
 * Every room plugin. The API registers these; studio-bridge reads their schemas.
 * Order is the admin Overview order.
 */
export const pluginFactories: PluginFactory[] = [
  createPlaylistDemocracyPlugin,
  createSpecialWordsPlugin,
  createAbsentDjPlugin,
  createQueueHygienePlugin,
  createGuessTheTunePlugin,
  // Before Road Trip, which calls Item Shops' `shopAccess` while it registers.
  createItemShopsPlugin,
  createLoyaltyProgramPlugin,
  createQueuePacerPlugin,
  createQuizSessionsPlugin,
  createPlaylistBingoPlugin,
  createRoundRobinDjPlugin,
  createMusicUploadPlugin,
  createVolumeManagerPlugin,
  createQueueThemePlugin,
  createTheFedPlugin,
  createLyricHeroPlugin,
  createRoadTripPlugin,
]
