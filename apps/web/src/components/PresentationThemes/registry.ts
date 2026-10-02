import type { ComponentType } from "react"
import type { PresentationTheme } from "@repo/types"
import { RoadTripSignMessage } from "./chatThemes/roadTrip"
import { roadTripPollTheme } from "./pollThemes/roadTrip"
import type { ChatThemeMessageProps, PollTheme } from "./types"

/** One registry for themed system messages and plugin polls (ADR 0203). */
const CHAT_THEMES: Record<PresentationTheme, ComponentType<ChatThemeMessageProps>> = {
  "road-trip": RoadTripSignMessage,
}

const POLL_THEMES: Record<PresentationTheme, PollTheme> = {
  "road-trip": roadTripPollTheme,
}

/** Unknown or missing themes return undefined so callers keep the plain look. */
export function getChatTheme(
  theme: string | null | undefined,
): ComponentType<ChatThemeMessageProps> | undefined {
  return theme ? CHAT_THEMES[theme as PresentationTheme] : undefined
}

export function getPollTheme(theme: string | null | undefined): PollTheme | undefined {
  return theme ? POLL_THEMES[theme as PresentationTheme] : undefined
}
