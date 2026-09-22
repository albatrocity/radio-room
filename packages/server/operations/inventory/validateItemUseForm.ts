import type { ItemUseResult, PluginActionFormField } from "@repo/types"

const MAX_STRING_LENGTH = 2000

export type ValidatedFormValues = Record<string, string | number>

function isStringLikeField(type: PluginActionFormField["type"]): boolean {
  return (
    type === "string" ||
    type === "textarea" ||
    type === "password" ||
    type === "select" ||
    type === "user-select" ||
    type === "combobox"
  )
}

/**
 * Validate and coerce client `formValues` against an item's `useForm` schema (ADR 0187).
 * Drops unknown keys; fails on missing required fields or invalid numbers.
 * Does not validate `optionsSource` membership or enforce `maxFrom` (client-only).
 * Password values are accepted as strings and never echoed in error messages.
 */
export function validateItemUseFormValues(
  fields: PluginActionFormField[] | undefined,
  raw: unknown,
): { ok: true; formValues: ValidatedFormValues } | { ok: false; result: ItemUseResult } {
  if (!fields || fields.length === 0) {
    return { ok: true, formValues: {} }
  }

  const input =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {}

  const formValues: ValidatedFormValues = {}

  for (const field of fields) {
    const rawValue = input[field.name]
    if (field.type === "number") {
      if (rawValue == null || rawValue === "") {
        if (field.required) {
          return {
            ok: false,
            result: {
              success: false,
              consumed: false,
              message: `Please fill in "${field.label}".`,
            },
          }
        }
        continue
      }
      const n = typeof rawValue === "number" ? rawValue : Number(String(rawValue).trim())
      if (!Number.isFinite(n)) {
        return {
          ok: false,
          result: {
            success: false,
            consumed: false,
            message: `"${field.label}" must be a number.`,
          },
        }
      }
      if (field.integer && !Number.isInteger(n)) {
        return {
          ok: false,
          result: {
            success: false,
            consumed: false,
            message: `"${field.label}" must be a whole number.`,
          },
        }
      }
      if (field.min != null && n < field.min) {
        return {
          ok: false,
          result: {
            success: false,
            consumed: false,
            message: `"${field.label}" must be at least ${field.min}.`,
          },
        }
      }
      // `maxFrom` is client-only — do not enforce here.
      if (field.max != null && n > field.max) {
        return {
          ok: false,
          result: {
            success: false,
            consumed: false,
            message: `"${field.label}" must be at most ${field.max}.`,
          },
        }
      }
      formValues[field.name] = n
      continue
    }

    if (!isStringLikeField(field.type)) {
      continue
    }

    const asString =
      typeof rawValue === "string"
        ? rawValue
        : rawValue == null
          ? ""
          : String(rawValue)
    const trimmed = asString.trim()
    if (field.required && !trimmed) {
      return {
        ok: false,
        result: {
          success: false,
          consumed: false,
          message: `Please fill in "${field.label}".`,
        },
      }
    }
    if (!trimmed && !field.required) continue

    // Declared maxLength: reject over-limit (do not trim/slice). Password values are never
    // included in the error message — only the field label.
    if (
      field.maxLength != null &&
      (field.type === "string" || field.type === "textarea" || field.type === "password") &&
      asString.length > field.maxLength
    ) {
      return {
        ok: false,
        result: {
          success: false,
          consumed: false,
          message: `"${field.label}" must be at most ${field.maxLength} characters.`,
        },
      }
    }

    // Fallback clamp when no field maxLength is declared.
    formValues[field.name] =
      asString.length > MAX_STRING_LENGTH ? asString.slice(0, MAX_STRING_LENGTH) : asString
  }

  return { ok: true, formValues }
}
