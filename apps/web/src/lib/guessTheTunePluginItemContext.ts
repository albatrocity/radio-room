import type { PluginElementKey, PluginElementProps } from "@repo/types"

const GUESS_THE_TUNE_PLUGIN = "guess-the-tune"

/**
 * Item context for Guess the Tune `nowPlayingInfo` plugin components.
 *
 * Uses room-level `elementProps` from augmentation (global reveals), not per-user
 * `userReveals`. In inclusive mode per-user guesses keep room-level slots obscured
 * until an admin global reveal.
 */
export function guessTheTuneNowPlayingItemContext(
  pluginData: Record<string, unknown> | undefined,
): Record<string, boolean> | undefined {
  const data = pluginData?.[GUESS_THE_TUNE_PLUGIN] as
    | { elementProps?: Partial<Record<PluginElementKey, PluginElementProps>> }
    | undefined
  const elementProps = data?.elementProps
  if (!elementProps) return undefined

  const titleObscured = elementProps.title?.obscured === true
  const artistObscured = elementProps.artist?.obscured === true
  const albumObscured = elementProps.album?.obscured === true

  return {
    titleObscured,
    artistObscured,
    albumObscured,
    anyObscured: titleObscured || artistObscured || albumObscured,
  }
}
