import { Field, Input, NativeSelect, Textarea } from "@chakra-ui/react"
import type { PluginActionFormField } from "@repo/types/Plugin"
import type { User } from "../types/User"

export function emptyPluginFormState(fields: PluginActionFormField[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of fields) out[f.name] = ""
  return out
}

export function buildPluginFormState(
  fields: PluginActionFormField[],
  allValues: Record<string, unknown>,
): Record<string, string> {
  const out = emptyPluginFormState(fields)
  for (const f of fields) {
    if (!f.seedFromField) continue
    const raw = allValues[f.seedFromField]
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue
    const divide = f.seedDivide ?? 1
    out[f.name] = String(Math.round(raw / divide))
  }
  return out
}

function collectSelectOptions(field: PluginActionFormField, users: User[]) {
  const staticOpts = field.options ?? []
  const userOpts =
    field.type === "user-select"
      ? users.map((u) => ({ value: u.userId, label: u.username ?? u.userId }))
      : []
  return [...staticOpts, ...userOpts]
}

export type PluginFormValues = Record<string, string>

export type CollectPluginFormValuesResult =
  | { ok: true; values: Record<string, string | number> }
  | { ok: false; error: { title: string; description: string } }

/**
 * Client-side collect + validate for {@link PluginActionFormField} lists.
 * Mirrors server `validateItemUseFormValues` number rules (ADR 0187).
 */
export function collectPluginFormValues(
  fields: PluginActionFormField[],
  formValues: PluginFormValues,
): CollectPluginFormValuesResult {
  const out: Record<string, string | number> = {}
  for (const f of fields) {
    const raw = formValues[f.name] ?? ""
    const trimmed = typeof raw === "string" ? raw.trim() : String(raw)
    if (f.required && !trimmed) {
      return {
        ok: false,
        error: {
          title: "Missing information",
          description: `Please fill in "${f.label}".`,
        },
      }
    }
    if (f.type === "number") {
      if (!trimmed && !f.required) continue
      const n = Number(trimmed)
      if (!Number.isFinite(n)) {
        return {
          ok: false,
          error: {
            title: "Invalid number",
            description: `"${f.label}" must be a number.`,
          },
        }
      }
      if (f.integer && !Number.isInteger(n)) {
        return {
          ok: false,
          error: {
            title: "Invalid number",
            description: `"${f.label}" must be a whole number.`,
          },
        }
      }
      if (f.min != null && n < f.min) {
        return {
          ok: false,
          error: {
            title: "Invalid number",
            description: `"${f.label}" must be at least ${f.min}.`,
          },
        }
      }
      if (f.max != null && n > f.max) {
        return {
          ok: false,
          error: {
            title: "Invalid number",
            description: `"${f.label}" must be at most ${f.max}.`,
          },
        }
      }
      out[f.name] = n
    } else if (trimmed || f.required) {
      out[f.name] = typeof raw === "string" ? raw : trimmed
    }
  }
  return { ok: true, values: out }
}

/**
 * Presentational renderer for {@link PluginActionFormField} lists.
 * Used by admin plugin action forms and inventory `useForm` popovers (ADR 0187).
 */
export function PluginFormFields({
  fields,
  values,
  onChange,
  users = [],
}: {
  fields: PluginActionFormField[]
  values: PluginFormValues
  onChange: (name: string, value: string) => void
  /** Required when any field is `user-select`. */
  users?: User[]
}) {
  return (
    <>
      {fields.map((field) => (
        <Field.Root key={field.name}>
          <Field.Label fontSize="sm">{field.label}</Field.Label>
          {field.type === "textarea" ? (
            <Textarea
              size="sm"
              rows={field.rows ?? 3}
              placeholder={field.placeholder}
              value={values[field.name] ?? ""}
              onChange={(e) => onChange(field.name, e.target.value)}
            />
          ) : field.type === "string" ? (
            <Input
              size="sm"
              placeholder={field.placeholder}
              value={values[field.name] ?? ""}
              onChange={(e) => onChange(field.name, e.target.value)}
            />
          ) : field.type === "number" ? (
            <Input
              size="sm"
              type="number"
              placeholder={field.placeholder}
              min={field.min}
              max={field.max}
              step={field.integer ? 1 : "any"}
              value={values[field.name] ?? ""}
              onChange={(e) => onChange(field.name, e.target.value)}
            />
          ) : field.type === "combobox" ? (
            <>
              <Input
                size="sm"
                list={`${field.name}-options`}
                placeholder={field.placeholder}
                value={values[field.name] ?? ""}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
              <datalist id={`${field.name}-options`}>
                {(field.options ?? []).map((o) => (
                  <option key={`${field.name}-${o.value}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </datalist>
            </>
          ) : (
            <NativeSelect.Root size="sm">
              <NativeSelect.Field
                value={values[field.name] ?? ""}
                onChange={(e) => onChange(field.name, e.target.value)}
              >
                <option value="">Select…</option>
                {collectSelectOptions(field, users).map((o) => (
                  <option key={`${field.name}-${o.value}`} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </NativeSelect.Field>
              <NativeSelect.Indicator />
            </NativeSelect.Root>
          )}
          {field.helperText ? <Field.HelperText>{field.helperText}</Field.HelperText> : null}
        </Field.Root>
      ))}
    </>
  )
}
