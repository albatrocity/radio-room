/**
 * Sound Effects Preference Hook
 *
 * In-app toggle for plugin sound effects (queueSoundEffect / SOUND_EFFECT_QUEUED).
 */

import { useSyncExternalStore, useCallback } from "react"
import {
  soundEffectsPreferenceActor,
  toggleSoundEffectsEnabled,
} from "../actors/soundEffectsPreferenceActor"

function getActorEnabled(): boolean {
  return soundEffectsPreferenceActor.getSnapshot().context.enabled
}

function subscribeToActor(callback: () => void): () => void {
  const subscription = soundEffectsPreferenceActor.subscribe(callback)
  return () => subscription.unsubscribe()
}

/**
 * Hook for the settings toggle UI.
 * Returns `soundEffectsEnabled: true` when SFX should play.
 */
export function useSoundEffectsPreference(): {
  soundEffectsEnabled: boolean
  toggleSoundEffects: () => void
} {
  const soundEffectsEnabled = useSyncExternalStore(
    subscribeToActor,
    getActorEnabled,
    () => true, // Server snapshot — default on
  )

  const toggleSoundEffects = useCallback(() => {
    toggleSoundEffectsEnabled()
  }, [])

  return { soundEffectsEnabled, toggleSoundEffects }
}
