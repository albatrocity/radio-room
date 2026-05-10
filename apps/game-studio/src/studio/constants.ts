export const STUDIO_ROOM_ID = "studio-room"

/**
 * Set in sessionStorage before reload by Reset — bootstrap clears the queue on the next load
 * so a fresh studio isn’t left with a hydrated queue from persistence.
 */
export const STUDIO_SESSION_AFTER_RESET_KEY = "game-studio-after-reset"

/** Last user id sent to studio-bridge “view as” (Listening Room preview) — Game Studio button state. */
export const STUDIO_PREVIEW_VIEW_AS_USER_KEY = "game-studio-preview-view-as-user"

/** Minimal ISO timestamps for chat messages */
export function isoNow(): string {
  return new Date().toISOString()
}
