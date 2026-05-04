/**
 * Random follow-up lines from a Sweetwater sales rep after a purchase.
 * Placeholders: `{{username}}`, `{{purchasedItemName}}` (use `@{{username}}` in copy for @-style display).
 */
export const SWEETWATER_SALES_REP_MESSAGES: readonly string[] = [
  "Hey @{{username}}! It's your Sweetwater rep — how are you liking that {{purchasedItemName}} so far?",
  "@{{username}}, quick check-in: still enjoying the {{purchasedItemName}}, or ready to talk upgrades?",
  "Hi @{{username}}! Wanted to see how that {{purchasedItemName}} was treating you in the room.",
  "@{{username}}, circling back — loving the {{purchasedItemName}}, or thinking about pairing it with something new?",
  "Sweetwater here, @{{username}}! Curious if the {{purchasedItemName}} landed the way you hoped.",
  "@{{username}}, friendly follow-up: how's the {{purchasedItemName}} working out for you?",
  "Hey @{{username}}! Any questions about the {{purchasedItemName}}? Happy to walk through settings.",
  "@{{username}}, just thinking about your studio — still vibing with the {{purchasedItemName}}?",
  "Hi @{{username}}! Wondering if you were interested in any particular gear lately besides the {{purchasedItemName}}.",
  "@{{username}}, if you're thinking about upgrading your studio, we've got bundles that play nice with the {{purchasedItemName}}.",
  "@{{username}}, studio upgrade season — want me to line up some options next to your {{purchasedItemName}}?",
  "Hey @{{username}}! Thinking about upgrading your studio? I can sketch a signal path around the {{purchasedItemName}}.",
  "@{{username}}, curious if you've been eyeing any mics, monitors, or interfaces since grabbing the {{purchasedItemName}}.",
  "Hi @{{username}}! Wondering if you were interested in any particular gear lately — cables, stands, the usual suspects?",
  "@{{username}}, any particular gear on your mind this week? (No pressure — the {{purchasedItemName}} is already a win.)",
  "Sweetwater rep here, @{{username}} — wondering if you were interested in any particular gear lately for the room.",
  "@{{username}}, if you're wondering about any particular gear lately, I'm here — also, how's the {{purchasedItemName}}?",
  "Hey @{{username}}! Still digging the {{purchasedItemName}}, or thinking about leveling up the rest of the chain?",
  "@{{username}}, how's that {{purchasedItemName}} sitting in the mix? Want recs for the next piece?",
  "Hi @{{username}}! Checking in — loving the {{purchasedItemName}}, and if you're thinking about upgrading your studio, say the word.",
]

export function pickRandomSweetwaterMessage(): string {
  const i = Math.floor(Math.random() * SWEETWATER_SALES_REP_MESSAGES.length)
  return SWEETWATER_SALES_REP_MESSAGES[i]!
}

export function formatSweetwaterMessage(
  template: string,
  username: string,
  purchasedItemName: string,
): string {
  return template
    .replace(/\{\{username\}\}/g, username)
    .replace(/\{\{purchasedItemName\}\}/g, purchasedItemName)
}
