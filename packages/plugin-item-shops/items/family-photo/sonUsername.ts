const SON_SUFFIX = "'s son"

/** Append `'s son` to a username for the next generation. */
export function sonUsernameFor(parentUsername: string): string {
  const base = parentUsername.trim() || "Someone"
  return `${base}${SON_SUFFIX}`
}

/**
 * Depth of a son username path: count of `'s son` suffixes.
 * Plain users are depth 0; `{name}'s son` is 1; nested continues.
 */
export function sonDepthFromUsername(username: string): number {
  let depth = 0
  let rest = username
  while (rest.endsWith(SON_SUFFIX)) {
    depth += 1
    rest = rest.slice(0, -SON_SUFFIX.length)
  }
  return depth
}
