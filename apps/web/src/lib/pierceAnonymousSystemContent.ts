import { PRESENTED_IDENTITY_ANONYMOUS_LABEL } from "@repo/game-logic"

/** Default legacy anonymous attribution label (canonical value in `@repo/game-logic`). */
export const ANONYMOUS_PUBLIC_LABEL = PRESENTED_IDENTITY_ANONYMOUS_LABEL

/**
 * Replace left-to-right masked label tokens with real usernames when the viewer
 * has inventory_peek and the message carries `meta.maskedUserIds` (ADR 0149 / 0150).
 */
export function pierceAnonymousSystemContent(
  content: string,
  maskedUserIds: string[] | undefined,
  pierce: boolean,
  resolveName: (userId: string) => string = (userId) => userId,
  maskedLabel: string = ANONYMOUS_PUBLIC_LABEL,
): string {
  if (!pierce || !maskedUserIds || maskedUserIds.length === 0) return content
  const label = maskedLabel.trim() || ANONYMOUS_PUBLIC_LABEL
  let i = 0
  return content.replace(new RegExp(escapeRegExp(label), "g"), () => {
    const userId = maskedUserIds[i++]
    if (!userId) return label
    return resolveName(userId) || label
  })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}
