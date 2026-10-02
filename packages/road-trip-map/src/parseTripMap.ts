import { tripMapContentHash } from "./hash"
import { hasLintErrors, lintTripMap, type LintTripMapDeps, type TripMapIssue } from "./lint"
import { TRIP_MAP_MAX_BYTES, tripMapSchema, type TripMap } from "./schema"

export type ParseTripMapResult =
  | { ok: true; map: TripMap; hash: string; issues: TripMapIssue[] }
  | { ok: false; map?: TripMap; issues: TripMapIssue[] }

/**
 * The one entry point for Trip Map JSON (ADR 0202): size limit, JSON parse,
 * schema, then lint. `ok` is false when there is any error-severity issue.
 */
export function parseTripMap(
  input: string | unknown,
  deps: LintTripMapDeps = {},
): ParseTripMapResult {
  let raw: unknown = input
  if (typeof input === "string") {
    if (utf8Length(input) > TRIP_MAP_MAX_BYTES) {
      return {
        ok: false,
        issues: [
          {
            severity: "error",
            code: "too-large",
            message: `Trip maps are limited to ${Math.round(TRIP_MAP_MAX_BYTES / 1024)} KB.`,
          },
        ],
      }
    }
    try {
      raw = JSON.parse(input)
    } catch (error) {
      return {
        ok: false,
        issues: [
          {
            severity: "error",
            code: "invalid-json",
            message: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
      }
    }
  }

  const parsed = tripMapSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        severity: "error" as const,
        code: "schema",
        message:
          issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
        path: issue.path.join("."),
      })),
    }
  }

  const map = parsed.data
  const issues = lintTripMap(map, deps)
  if (hasLintErrors(issues)) return { ok: false, map, issues }
  return { ok: true, map, hash: tripMapContentHash(map), issues }
}

function utf8Length(text: string): number {
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(text).length
  return text.length
}
