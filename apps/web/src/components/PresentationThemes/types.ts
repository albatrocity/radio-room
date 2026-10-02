import type { ComponentType, ReactNode } from "react"
import type { PresentationVariant } from "@repo/types"
import type { Poll, PollOption } from "@repo/types/Poll"

export type ChatThemeMessageProps = {
  content: string
  title?: string | null
  status?: PresentationVariant
  icon?: string
  /** Formatted local send time. */
  time: string
}

export type PollThemeHeaderProps = {
  poll: Poll
  /** Card controls (close / collapse / dismiss) rendered by `PollCard`. */
  actions: ReactNode
}

/**
 * Look-only overrides for `PollCard` (ADR 0203). Voting, results, and
 * countdown behavior stay in `PollCard`; a theme only changes how they read.
 */
export type PollTheme = {
  Header: ComponentType<PollThemeHeaderProps>
  collapsedLabel: (poll: Poll) => string
  optionLabel: (poll: Poll, option: PollOption) => string
  /** Replaces the plain `closesAt` ExpiryBar on the expanded card. */
  CloseBar: ComponentType<{ poll: Poll; endAt: number }>
  Footer?: ComponentType<{ poll: Poll }>
}
