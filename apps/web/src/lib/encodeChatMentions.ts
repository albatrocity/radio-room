/**
 * Wire format expected by server `parseMessage` (`packages/server/lib/parseMessage.ts`):
 * `@[display](userId)` segments are parsed into mentions + normalized `@display` content.
 */
export function mentionMarkup(display: string, id: string): string {
  return `@[${display}](${id}) `
}

/** Recorded when the user picks someone from the mention overlay (display + stable user id). */
export type MentionPick = { userId: string; display: string }

function namesEq(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

function isMentionBoundaryChar(ch: string | undefined): boolean {
  if (ch === undefined) return true
  if (/\s/.test(ch)) return true
  if (ch === "@") return true
  if (/[,.;:!?)\]]/.test(ch)) return true
  return false
}

function suffixStartsWithDisplayInsensitive(suffix: string, display: string): boolean {
  if (display.length === 0 || display.length > suffix.length) return false
  return (
    suffix.slice(0, display.length).toLowerCase() === display.toLowerCase()
  )
}

/** `@` at start of text or immediately after whitespace (not inside emails). */
function findValidMentionAtIndices(text: string): number[] {
  const ats: number[] = []
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== "@") continue
    if (i > 0 && !/\s/.test(text[i - 1]!)) continue
    ats.push(i)
  }
  return ats
}

function uniqueDisplaysSortedLongestFirst(knownDisplays: string[] | undefined): string[] {
  if (!knownDisplays?.length) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const d of knownDisplays) {
    const t = d.trim()
    if (!t || seen.has(t.toLowerCase())) continue
    seen.add(t.toLowerCase())
    out.push(t)
  }
  return out.sort((a, b) => b.length - a.length)
}

export type ScanMentionsOptions = {
  /** Room (and registry) display names; used to end the last `@…` run on multi-word names. */
  knownDisplays?: string[]
}

/**
 * Valid `@handle` runs: `@` at start or after whitespace.
 * — Between two such `@` symbols, the handle is the trimmed span (spaces allowed).
 * — After the final `@`, if `knownDisplays` is set, the handle is the longest matching display
 *   with a boundary (whitespace, `@`, punctuation, or end); otherwise a single token (no spaces).
 */
export function scanValidMentions(
  text: string,
  options?: ScanMentionsOptions,
): { start: number; end: number; name: string }[] {
  const runs: { start: number; end: number; name: string }[] = []
  const ats = findValidMentionAtIndices(text)
  const knownSorted = uniqueDisplaysSortedLongestFirst(options?.knownDisplays)

  for (let idx = 0; idx < ats.length; idx++) {
    const at = ats[idx]!
    const nextAt = ats[idx + 1] ?? null

    let name: string
    let end: number

    if (nextAt !== null) {
      const raw = text.slice(at + 1, nextAt)
      name = raw.replace(/\s+$/u, "")
      end = at + 1 + name.length
    } else {
      const suffix = text.slice(at + 1)
      let matched: string | null = null
      for (const display of knownSorted) {
        if (!suffixStartsWithDisplayInsensitive(suffix, display)) continue
        const after = suffix[display.length]
        if (!isMentionBoundaryChar(after)) continue
        matched = suffix.slice(0, display.length)
        break
      }
      if (matched !== null) {
        name = matched
        end = at + 1 + name.length
      } else {
        let j = at + 1
        while (j < text.length && !/\s/.test(text[j]!) && text[j] !== "@") {
          j++
        }
        name = text.slice(at + 1, j)
        end = j
      }
    }

    if (name.length > 0) {
      runs.push({ start: at, end, name })
    }
  }

  return runs
}

/**
 * For each valid @-run in `text` (left to right), the picked user if one unused registry entry
 * matches that handle, else null (typed manually or no pick left).
 */
export function alignMentionsToRuns(
  text: string,
  registry: MentionPick[],
  knownDisplays?: string[],
): (MentionPick | null)[] {
  const runs = scanValidMentions(text, { knownDisplays })
  const used = new Set<number>()
  return runs.map((run) => {
    const idx = registry.findIndex((r, i) => !used.has(i) && namesEq(run.name, r.display))
    if (idx === -1) return null
    used.add(idx)
    return registry[idx]
  })
}

/**
 * Registry entries that still correspond to @handles in the draft, in text order. Drops orphans.
 */
export function reconcileMentionRegistryWithText(
  text: string,
  registry: MentionPick[],
  knownDisplays?: string[],
): MentionPick[] {
  return alignMentionsToRuns(text, registry, knownDisplays).filter((p): p is MentionPick => p != null)
}

/**
 * Turns plain-text `@display` into `@[display](userId) ` when aligned to an overlay pick.
 * Other `@name` segments stay literal.
 */
export function encodePlainTextMentionsForServer(
  text: string,
  registry: MentionPick[],
  knownDisplays?: string[],
): string {
  const runs = scanValidMentions(text, { knownDisplays })
  const alignment = alignMentionsToRuns(text, registry, knownDisplays)
  let out = ""
  let pos = 0
  runs.forEach((run, k) => {
    out += text.slice(pos, run.start)
    const pick = alignment[k]
    if (pick) {
      out += mentionMarkup(pick.display, pick.userId)
    } else {
      out += text.slice(run.start, run.end)
    }
    pos = run.end
  })
  out += text.slice(pos)
  return out
}
