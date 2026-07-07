import type { PluginFieldMeta, ShowWhenCondition } from "@repo/types/Plugin"

/**
 * Check if an element should be visible based on its showWhen condition(s).
 * If an array is provided, ALL conditions must be true (AND logic).
 *
 * `values` is the scope the conditions resolve against: for top-level fields
 * this is the whole config; for `object-array` sub-fields it is the *row* object,
 * which is what makes nested conditional visibility work.
 */
export function shouldShow(
  showWhen: ShowWhenCondition | ShowWhenCondition[] | undefined,
  values: Record<string, unknown>,
): boolean {
  if (!showWhen) return true
  if (Array.isArray(showWhen)) {
    return showWhen.every((c) => values[c.field] === c.value)
  }
  return values[showWhen.field] === showWhen.value
}

/** Build an empty row object from an object-array field's item sub-fields. */
export function emptyRow(itemFields: { name: string; meta: PluginFieldMeta }[]): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const { name, meta } of itemFields) {
    row[name] = defaultForField(meta)
  }
  return row
}

function defaultForField(meta: PluginFieldMeta): unknown {
  switch (meta.type) {
    case "boolean":
      return false
    case "number":
    case "percentage":
    case "duration":
      return 0
    case "string-array":
    case "checkbox-group":
    case "object-array":
      return []
    default:
      return ""
  }
}

// ---------------------------------------------------------------------------
// Immutable row operations for object-array values.
// ---------------------------------------------------------------------------

export function addRow(
  rows: Record<string, unknown>[],
  row: Record<string, unknown>,
): Record<string, unknown>[] {
  return [...rows, row]
}

export function removeRow(rows: Record<string, unknown>[], index: number): Record<string, unknown>[] {
  return rows.filter((_, i) => i !== index)
}

export function updateRow(
  rows: Record<string, unknown>[],
  index: number,
  field: string,
  value: unknown,
): Record<string, unknown>[] {
  return rows.map((r, i) => (i === index ? { ...r, [field]: value } : r))
}

export function moveRow(
  rows: Record<string, unknown>[],
  from: number,
  to: number,
): Record<string, unknown>[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows
  const next = [...rows]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}

/**
 * Resolve the JSON Schema fragment for an object-array field's items, so nested
 * enum options resolve from `properties[field].items` rather than the top level.
 * Returns an empty object if the array field / items are not described.
 */
export function getItemJsonSchema(
  jsonSchema: Record<string, unknown>,
  arrayFieldName: string,
): Record<string, unknown> {
  const properties = jsonSchema.properties as Record<string, any> | undefined
  const items = properties?.[arrayFieldName]?.items
  return items && typeof items === "object" ? (items as Record<string, unknown>) : {}
}
