/** Stable notification id for an unread What’s new month (ADR 0177). */

export function whatsNewMonthNotificationId(monthId: string): string {
  return `whats-new-month-${monthId}`
}
