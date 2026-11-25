import { Button, Field, HStack, Input, NativeSelect, Stack, Text } from "@chakra-ui/react"
import { useRef } from "react"
import {
  NARRATIVE_SOUNDS_MAX,
  SITE_NARRATIVE_SOUND_TRIGGERS,
  type SiteNarrativeSound,
  type SiteNarrativeSoundTrigger,
  type TripNarrativeSound,
} from "@repo/road-trip-map"
import { toaster } from "../ui/toaster"
import {
  pendingSoundKey,
  SOUND_ACCEPT,
  uploadSiteAsset,
  type PendingNarrativeSounds,
  type SiteAssetStatus,
} from "../../tripMap/siteAssets"

type SiteProps = {
  scope: "site"
  siteId: string
  sounds: SiteNarrativeSound[]
  /** Destination departure clips never play. */
  destination?: boolean
  onChange: (sounds: SiteNarrativeSound[] | undefined) => void
}

type TripProps = {
  scope: "trip"
  sounds: TripNarrativeSound[]
  onChange: (sounds: TripNarrativeSound[] | undefined) => void
}

type SharedProps = {
  assetStatus: SiteAssetStatus | null
  pendingSounds: PendingNarrativeSounds
  setPendingSounds: (
    update: (prev: PendingNarrativeSounds) => PendingNarrativeSounds,
  ) => void
}

type Props = (SiteProps | TripProps) & SharedProps

function soundTrigger(value: string): SiteNarrativeSoundTrigger | undefined {
  return SITE_NARRATIVE_SOUND_TRIGGERS.find((trigger) => trigger === value)
}

function playUrl(url: string) {
  try {
    const audio = new Audio(url)
    void audio.play()
  } catch {
    toaster.create({ title: "Couldn't play that URL", type: "error" })
  }
}

/**
 * Ordered narrative sound rows (ADR 0240). Site rows pick Arrival / Departure;
 * trip rows are departure-only. Each row can paste an https URL or publish a file.
 */
export function NarrativeSoundsEditor(props: Props) {
  const { assetStatus, pendingSounds, setPendingSounds } = props
  const uploadsOff = assetStatus !== null && !assetStatus.configured
  const sounds = props.sounds
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const set = (next: { trigger: string; url: string }[]) => {
    if (props.scope === "site") {
      props.onChange(next.length > 0 ? (next as SiteNarrativeSound[]) : undefined)
    } else {
      props.onChange(
        next.length > 0
          ? next.map((entry) => ({
              trigger: "departure" as const,
              url: entry.url,
            }))
          : undefined,
      )
    }
  }

  const labelFor = (index: number) => {
    if (props.scope === "trip") return `Trip departure sound ${index + 1}`
    const siteName = props.siteId
    return `${siteName} sound ${index + 1}`
  }

  const uploadAt = async (index: number, file: File) => {
    const key = pendingSoundKey(
      props.scope,
      index,
      props.scope === "site" ? props.siteId : undefined,
    )
    setPendingSounds((prev) => ({
      ...prev,
      [key]: { key, label: labelFor(index), status: "uploading" },
    }))
    const result = await uploadSiteAsset("sound", file)
    if (result.ok) {
      const next = [...sounds]
      const trigger =
        props.scope === "trip"
          ? ("departure" as const)
          : (next[index]?.trigger ?? "arrival")
      next[index] = { trigger, url: result.url }
      set(next)
      setPendingSounds((prev) => {
        const { [key]: _done, ...rest } = prev
        return rest
      })
      toaster.create({
        title: result.reused ? "Already on the CDN" : "Published to the CDN",
        type: "success",
      })
    } else {
      setPendingSounds((prev) =>
        prev[key]
          ? { ...prev, [key]: { ...prev[key], status: "failed", message: result.message } }
          : prev,
      )
    }
  }

  const discardPending = (index: number) => {
    const key = pendingSoundKey(
      props.scope,
      index,
      props.scope === "site" ? props.siteId : undefined,
    )
    setPendingSounds((prev) => {
      const { [key]: _gone, ...rest } = prev
      return rest
    })
  }

  return (
    <Stack gap="2">
      <Text fontSize="xs" fontWeight="semibold">
        Sounds
      </Text>
      <Text fontSize="xs" color="fg.muted">
        {props.scope === "trip"
          ? "Queued when the trip departs (the On the road sign). MP3, WAV, or Ogg, 2 MB max."
          : "Queued on arrival or when the van leaves. Plays even without narrative copy. MP3, WAV, or Ogg, 2 MB max."}
      </Text>
      {props.scope === "site" && props.destination ? (
        <Text fontSize="xs" color="fg.muted">
          Departure sounds on the destination never play; the trip ends here.
        </Text>
      ) : null}
      {uploadsOff ? (
        <Text fontSize="xs" color="fg.muted">
          {assetStatus?.message ?? "Uploads unavailable; paste a CDN URL instead."}
        </Text>
      ) : null}
      {sounds.map((entry, index) => {
        const key = pendingSoundKey(
          props.scope,
          index,
          props.scope === "site" ? props.siteId : undefined,
        )
        const pending = pendingSounds[key]
        return (
          <Stack key={index} gap="2" borderWidth="1px" borderRadius="md" p="2">
            <HStack justify="space-between" align="flex-start" gap="2" flexWrap="wrap">
              {props.scope === "site" ? (
                <Field.Root maxW="160px">
                  <Field.Label fontSize="xs">When</Field.Label>
                  <NativeSelect.Root size="sm">
                    <NativeSelect.Field
                      value={entry.trigger}
                      onChange={(e) => {
                        const trigger = soundTrigger(e.target.value)
                        if (!trigger) return
                        set(
                          sounds.map((item, i) =>
                            i === index ? { ...item, trigger } : item,
                          ),
                        )
                      }}
                    >
                      {SITE_NARRATIVE_SOUND_TRIGGERS.map((trigger) => (
                        <option key={trigger} value={trigger}>
                          {trigger.charAt(0).toUpperCase() + trigger.slice(1)}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                </Field.Root>
              ) : (
                <Text fontSize="xs" color="fg.muted" pt="6">
                  Departure
                </Text>
              )}
              <Button
                size="2xs"
                variant="ghost"
                colorPalette="red"
                onClick={() => {
                  discardPending(index)
                  set(sounds.filter((_, i) => i !== index))
                }}
              >
                Remove
              </Button>
            </HStack>
            <Field.Root>
              <Field.Label fontSize="xs">URL</Field.Label>
              <Input
                size="sm"
                placeholder="https://cdn.listeningroom.club/…"
                value={entry.url}
                onChange={(e) =>
                  set(
                    sounds.map((item, i) =>
                      i === index ? { ...item, url: e.target.value } : item,
                    ),
                  )
                }
              />
            </Field.Root>
            <HStack gap="2" flexWrap="wrap">
              <Button
                size="2xs"
                variant="outline"
                disabled={uploadsOff || pending?.status === "uploading"}
                onClick={() => fileRefs.current[index]?.click()}
              >
                Upload
              </Button>
              <input
                ref={(el) => {
                  fileRefs.current[index] = el
                }}
                type="file"
                hidden
                accept={SOUND_ACCEPT}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ""
                  if (file) void uploadAt(index, file)
                }}
              />
              <Button
                size="2xs"
                variant="ghost"
                disabled={!entry.url.startsWith("https://")}
                onClick={() => playUrl(entry.url)}
              >
                Play
              </Button>
            </HStack>
            {pending ? (
              <HStack justify="space-between" gap="2">
                <Text fontSize="xs" color={pending.status === "failed" ? "red.fg" : "fg.muted"}>
                  {pending.status === "uploading" ? "Publishing to the CDN…" : pending.message}
                </Text>
                {pending.status === "failed" ? (
                  <Button size="2xs" variant="ghost" onClick={() => discardPending(index)}>
                    Discard
                  </Button>
                ) : null}
              </HStack>
            ) : null}
          </Stack>
        )
      })}
      <Button
        size="xs"
        variant="outline"
        disabled={sounds.length >= NARRATIVE_SOUNDS_MAX}
        onClick={() => {
          if (props.scope === "site") {
            set([...sounds, { trigger: "arrival", url: "" }])
          } else {
            set([...sounds, { trigger: "departure", url: "" }])
          }
        }}
      >
        Add sound
      </Button>
    </Stack>
  )
}
