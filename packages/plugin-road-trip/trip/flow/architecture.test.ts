import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { renderFlowDocs } from "./docs"

/**
 * The trip flow's ownership rules (ADR 0222), checked on the source. The
 * compiler already stops `withSite` from writing a phase; these scans are the
 * backstop for what types can't see.
 */

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "../..")
const repoRoot = join(pluginRoot, "../..")

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (name === "node_modules") return []
    if (statSync(path).isDirectory()) return sources(path)
    return name.endsWith(".ts") && !name.endsWith(".test.ts") ? [path] : []
  })
}

const files = sources(pluginRoot).map((path) => ({
  path: relative(pluginRoot, path),
  text: readFileSync(path, "utf8"),
}))

function offenders(pattern: RegExp, allowed: (path: string) => boolean): string[] {
  return files.flatMap(({ path, text }) =>
    allowed(path)
      ? []
      : text
          .split("\n")
          .flatMap((line, i) => (pattern.test(line) ? [`${path}:${i + 1}: ${line.trim()}`] : [])),
  )
}

describe("trip flow ownership (ADR 0222)", () => {
  it("rule 1: only flow entities change the trip status or a phase", () => {
    const statuses = "loaded|driving|arrived|late|stranded|ended"
    const statusWrite = new RegExp(`\\bstatus:\\s*("(${statuses})"|\\w+\\s*\\?\\s*"(${statuses})")`)
    expect(
      offenders(
        statusWrite,
        (path) => path === "trip/flow/entities/trip.ts" || path === "trip/state.ts",
      ),
    ).toEqual([])
    // A runtime spread followed by a phase: a hand-written machine move.
    expect(offenders(/\.\.\.\w+,\s*phase:/, (path) => path.startsWith("trip/flow/"))).toEqual([])
    expect(
      offenders(
        /\bphase:\s*"(polling|stopping|parked|visited|bypassed)"/,
        (path) => path.startsWith("trip/flow/") || path === "trip/state.ts",
      ),
    ).toEqual([])
  })

  it("rule 2: only outcomes.ts interprets outcomes", () => {
    expect(
      offenders(
        /(case|===)\s*"(unlock|lock|divert|give-key|take-key|give-item)"/,
        (path) => path === "trip/flow/outcomes.ts",
      ),
    ).toEqual([])
  })

  it("rule 3: runtime code reads content from the path map, never the authored map", () => {
    expect(
      offenders(/\bsource\.(sites|events)\b|\blinearize\(/, (path) =>
        path.startsWith("trip/flow/"),
      ),
    ).toEqual([])
  })

  it("rule 4: only the van entity writes the van's key items (ADR 0230)", () => {
    expect(
      offenders(
        /\bkeyItems:\s*\{|\.keyItems\[[^\]]*\]\s*=[^=]/,
        (path) => path === "trip/flow/entities/van.ts" || path === "trip/state.ts",
      ),
    ).toEqual([])
  })

  it("docs/road-trip-flow.md is generated from the tables (run `npm run flow:docs`)", () => {
    // Formatters may realign tables; compare without their padding.
    const normalize = (text: string) =>
      text
        .replace(/[ \t]+/g, " ")
        .replace(/-{3,}/g, "---")
        .trim()
    const onDisk = readFileSync(join(repoRoot, "docs/road-trip-flow.md"), "utf8")
    expect(normalize(onDisk)).toBe(normalize(renderFlowDocs()))
  })
})
