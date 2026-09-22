import { useEffect, useId, useRef, useState } from "react"
import { Field, Input, NativeSelect, Text, Textarea } from "@chakra-ui/react"
import type { PluginActionFormField } from "@repo/types/Plugin"
import type { User } from "../types/User"
import { emitToSocket } from "../actors/socketActor"
import { subscribeForSocketResult } from "../lib/subscribeForSocketResult"

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

function effectiveNumberMax(
  field: PluginActionFormField,
  coinBalance: number | undefined,
): number | undefined {
  const fromBalance =
    field.maxFrom === "coinBalance" && coinBalance != null
      ? Math.max(0, Math.floor(coinBalance))
      : undefined
  if (field.max != null && fromBalance != null) return Math.min(field.max, fromBalance)
  if (fromBalance != null) return fromBalance
  return field.max
}

export type PluginFormValues = Record<string, string>

export type CollectPluginFormValuesResult =
  | { ok: true; values: Record<string, string | number> }
  | { ok: false; error: { title: string; description: string } }

export type CollectPluginFormValuesOptions = {
  /** Viewer coin balance for `maxFrom: "coinBalance"` caps (client-only). */
  coinBalance?: number
}

/**
 * Client-side collect + validate for {@link PluginActionFormField} lists.
 * Mirrors server `validateItemUseFormValues` number / maxLength rules (ADR 0187).
 * Enforces `maxFrom` on the client; core does not.
 */
export function collectPluginFormValues(
  fields: PluginActionFormField[],
  formValues: PluginFormValues,
  options?: CollectPluginFormValuesOptions,
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
      const max = effectiveNumberMax(f, options?.coinBalance)
      if (max != null && n > max) {
        return {
          ok: false,
          error: {
            title: "Invalid number",
            description: `"${f.label}" must be at most ${max}.`,
          },
        }
      }
      out[f.name] = n
    } else if (trimmed || f.required) {
      const asString = typeof raw === "string" ? raw : trimmed
      if (
        f.maxLength != null &&
        (f.type === "string" || f.type === "textarea" || f.type === "password") &&
        asString.length > f.maxLength
      ) {
        return {
          ok: false,
          error: {
            title: "Too long",
            description: `"${f.label}" must be at most ${f.maxLength} characters.`,
          },
        }
      }
      out[f.name] = asString
    }
  }
  return { ok: true, values: out }
}

type SayVoice = { id: string; name: string; locale: string }

const BRIDGE_OFFLINE_MESSAGE = "The line is dead — the DJ Mac isn’t linked."

/**
 * Fetches Media Bridge say voices for `optionsSource: "mediaBridgeVoices"`.
 */
function useMediaBridgeSayVoices(enabled: boolean) {
  const subId = useId()
  const [voices, setVoices] = useState<SayVoice[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) {
      setVoices([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    setVoices([])
    const cancel = subscribeForSocketResult<{
      voices?: SayVoice[]
      error?: string
    }>({
      id: `say-voices-form-${subId}`,
      eventType: "MEDIA_BRIDGE_SAY_VOICES_RESULT",
      toastTimeout: false,
      onResult: (data) => {
        setLoading(false)
        const list = Array.isArray(data.voices) ? data.voices : []
        setVoices(list)
        if (data.error || list.length === 0) {
          setError(data.error || BRIDGE_OFFLINE_MESSAGE)
          return
        }
        setError(null)
      },
      onTimeout: () => {
        setLoading(false)
        setError(BRIDGE_OFFLINE_MESSAGE)
      },
    })
    emitToSocket("GET_MEDIA_BRIDGE_SAY_VOICES", {})
    return cancel
  }, [enabled, subId])

  return { voices, loading, error }
}

function MediaBridgeVoiceSelectField({
  value,
  onChange,
  onBlockedChange,
}: {
  value: string
  onChange: (value: string) => void
  onBlockedChange: (blocked: boolean) => void
}) {
  const { voices, loading, error } = useMediaBridgeSayVoices(true)
  const blocked = loading || !!error || voices.length === 0
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onBlockedChangeRef = useRef(onBlockedChange)
  onBlockedChangeRef.current = onBlockedChange

  useEffect(() => {
    onBlockedChangeRef.current(blocked)
    return () => onBlockedChangeRef.current(false)
  }, [blocked])

  useEffect(() => {
    if (loading || error || voices.length === 0) return
    if (!value && voices[0]) onChangeRef.current(voices[0].id)
  }, [loading, error, voices, value])

  if (loading) {
    return (
      <Text fontSize="xs" color="fg.muted">
        Dialing the DJ Mac…
      </Text>
    )
  }
  if (error) {
    return (
      <Text fontSize="xs" color="fg.error">
        {error}
      </Text>
    )
  }
  return (
    <NativeSelect.Root size="sm">
      <NativeSelect.Field value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select…</option>
        {voices.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
            {v.locale ? ` (${v.locale})` : ""}
          </option>
        ))}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  )
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
  coinBalance,
  onSubmitBlockedChange,
}: {
  fields: PluginActionFormField[]
  values: PluginFormValues
  onChange: (name: string, value: string) => void
  /** Required when any field is `user-select`. */
  users?: User[]
  /** Viewer coin balance for `maxFrom: "coinBalance"`. */
  coinBalance?: number
  /**
   * Called when dynamic sources (e.g. Media Bridge voices) block submit —
   * loading, offline empty-state, or no voices.
   */
  onSubmitBlockedChange?: (blocked: boolean) => void
}) {
  const [voiceBlocked, setVoiceBlocked] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (!onSubmitBlockedChange) return
    const blocked = Object.values(voiceBlocked).some(Boolean)
    onSubmitBlockedChange(blocked)
  }, [voiceBlocked, onSubmitBlockedChange])

  return (
    <>
      {fields.map((field) => {
        const numberMax = effectiveNumberMax(field, coinBalance)
        return (
          <Field.Root key={field.name}>
            <Field.Label fontSize="sm">{field.label}</Field.Label>
            {field.type === "textarea" ? (
              <Textarea
                size="sm"
                rows={field.rows ?? 3}
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                value={values[field.name] ?? ""}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            ) : field.type === "password" ? (
              <Input
                size="sm"
                type="password"
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                value={values[field.name] ?? ""}
                onChange={(e) => onChange(field.name, e.target.value)}
                autoComplete="new-password"
              />
            ) : field.type === "string" ? (
              <Input
                size="sm"
                placeholder={field.placeholder}
                maxLength={field.maxLength}
                value={values[field.name] ?? ""}
                onChange={(e) => onChange(field.name, e.target.value)}
              />
            ) : field.type === "number" ? (
              <Input
                size="sm"
                type="number"
                placeholder={field.placeholder}
                min={field.min}
                max={numberMax}
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
            ) : field.optionsSource === "mediaBridgeVoices" ? (
              <MediaBridgeVoiceSelectField
                value={values[field.name] ?? ""}
                onChange={(v) => onChange(field.name, v)}
                onBlockedChange={(blocked) =>
                  setVoiceBlocked((prev) =>
                    prev[field.name] === blocked ? prev : { ...prev, [field.name]: blocked },
                  )
                }
              />
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
            {field.maxFrom === "coinBalance" && coinBalance != null ? (
              <Field.HelperText>
                Max {Math.max(0, Math.floor(coinBalance)).toLocaleString()}
              </Field.HelperText>
            ) : null}
          </Field.Root>
        )
      })}
    </>
  )
}
