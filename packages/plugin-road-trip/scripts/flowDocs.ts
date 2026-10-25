import { writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { renderFlowDocs } from "../trip/flow/docs"

/** Writes docs/road-trip-flow.md from the trip flow's tables (ADR 0222). */
const out = join(dirname(fileURLToPath(import.meta.url)), "../../../docs/road-trip-flow.md")
writeFileSync(out, renderFlowDocs())
console.log(`Wrote ${out}`)
