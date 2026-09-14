/**
 * Crowd mood copy + SFX for Lyric Hero (sour notes → walk-out).
 * Mood is a function of unique misses used vs missMax (default 6).
 */

export type CrowdMoodKind = "hit" | "miss" | "walkout"

const SFX_BASE = "https://cdn.listeningroom.club/assets/sfx"

export type CrowdMoodFeedback = {
  line: string
  soundUrl: string
}

export function moodLabelForMisses(missesUsed: number, missMax: number): string {
  if (missesUsed <= 0) return "locked in"
  const remaining = missMax - missesUsed
  if (remaining <= 0) return "walking out"
  if (missesUsed >= missMax - 1) return "booing"
  if (missesUsed >= Math.ceil(missMax * 0.5)) return "losing interest"
  return "restless"
}

/**
 * Public/private system-message line + accompanying SFX after a scoring hit or miss.
 * `username` is the guesser; `missesUsed` is post-guess unique miss count.
 * When `solved` is true, always plays `vox-yeah.mp3` (completing the lyric).
 * Locked-in / near-streak hits use `vox-woouhh.mp3` until the solve.
 */
export function crowdMoodFeedback(params: {
  kind: CrowdMoodKind
  username: string
  missesUsed: number
  missMax: number
  word?: string
  /** Completing the lyric — celebration SFX regardless of crowd mood. */
  solved?: boolean
}): CrowdMoodFeedback {
  const { kind, username, missesUsed, missMax, solved } = params
  const name = username.trim() || "Someone"
  const yeah = `${SFX_BASE}/vox-yeah.mp3`

  if (kind === "walkout") {
    return {
      line: `🚪 The crowd has heard enough — they're leaving. ${name} sang a sour note too many.`,
      soundUrl: `${SFX_BASE}/vox-bye-bye.mp3`,
    }
  }

  if (kind === "hit") {
    if (solved) {
      return {
        line:
          missesUsed > 0
            ? `🎸 ${name} finished the lyric — packed house goes wild!`
            : `🎸 ${name} finished the lyric — packed house, locked in!`,
        soundUrl: yeah,
      }
    }
    // Locked in / building a hot streak — woouhh until the solve lands yeah.
    if (missesUsed <= 0) {
      return {
        line: `🎸 ${name} nailed it — packed house, locked in!`,
        soundUrl: `${SFX_BASE}/vox-woouhh.mp3`,
      }
    }
    if (missesUsed >= missMax - 1) {
      return {
        line: `🎸 ${name} sang a word — the crowd's back with you, barely.`,
        soundUrl: `${SFX_BASE}/vox-hehh.mp3`,
      }
    }
    if (missesUsed >= Math.ceil(missMax * 0.5)) {
      return {
        line: `🎸 ${name} sang a word — phones going down, interest returning.`,
        soundUrl: `${SFX_BASE}/vox-mimimimimi.mp3`,
      }
    }
    return {
      line: `🎸 ${name} sang a word — the crowd stays with you.`,
      soundUrl: `${SFX_BASE}/vox-woouhh.mp3`,
    }
  }

  // miss
  if (missesUsed <= 1) {
    return {
      line: `🎵 Sour note from ${name} — the crowd is still with you.`,
      soundUrl: `${SFX_BASE}/vox-sour.mp3`,
    }
  }
  if (missesUsed === 2) {
    return {
      line: `🎵 Another sour note (${name}) — shifting in their seats.`,
      soundUrl: `${SFX_BASE}/vox-hehh.mp3`,
    }
  }
  if (missesUsed <= Math.floor(missMax * 0.66)) {
    return {
      line: `😕 ${name} missed — the crowd is losing interest.`,
      soundUrl: `${SFX_BASE}/vox-cough.mp3`,
    }
  }
  if (missesUsed < missMax) {
    return {
      line: `😠 Booing after ${name}'s miss — one more and they're gone.`,
      soundUrl: `${SFX_BASE}/crowd-boo.mp3`,
    }
  }
  return {
    line: `🚪 The crowd walks out after ${name}'s miss.`,
    soundUrl: `${SFX_BASE}/vox-bye-bye.mp3`,
  }
}

/** Message line only (tests / callers that don't need SFX). */
export function crowdMoodLine(params: {
  kind: CrowdMoodKind
  username: string
  missesUsed: number
  missMax: number
  word?: string
  solved?: boolean
}): string {
  return crowdMoodFeedback(params).line
}
