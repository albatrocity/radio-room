/** Humanize a plugin package name for admin UI labels (e.g. "guess-the-tune" → "Guess The Tune"). */
export function toPluginDisplayName(name: string): string {
  return name
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}
