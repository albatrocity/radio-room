export type ShowMusicTransport = "playing" | "paused" | "stopped" | null

export type ShowMusicControlMode = "pause" | "resume" | "startNext" | "idleEmpty"

export type ShowMusicControlView = {
  mode: ShowMusicControlMode
  tooltip: string
  ariaLabel: string
  showPauseIcon: boolean
  disabled: boolean
}

/**
 * Queue header Play/Pause presentation. Prefer this over nested ternaries so
 * tooltip, aria-label, icon, and disabled stay on one mode.
 */
export function getShowMusicControl(params: {
  transport: ShowMusicTransport
  canResume: boolean
  queueLength: number
  pending: boolean
}): ShowMusicControlView {
  const { transport, canResume, queueLength, pending } = params

  if (transport === "playing") {
    return {
      mode: "pause",
      tooltip: "Pause show music playback on Spotify",
      ariaLabel: "Pause show music playback",
      showPauseIcon: true,
      disabled: pending,
    }
  }

  if (canResume) {
    return {
      mode: "resume",
      tooltip: "Resume show music",
      ariaLabel: "Play show music",
      showPauseIcon: false,
      disabled: pending,
    }
  }

  if (queueLength > 0) {
    return {
      mode: "startNext",
      tooltip: "Start the next queued track",
      ariaLabel: "Play show music",
      showPauseIcon: false,
      disabled: pending,
    }
  }

  return {
    mode: "idleEmpty",
    tooltip: "Nothing in the queue to play",
    ariaLabel: "Play show music",
    showPauseIcon: false,
    disabled: true,
  }
}
