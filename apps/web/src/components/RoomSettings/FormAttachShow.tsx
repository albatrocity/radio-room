import { useEffect, useState } from "react"
import { Field, NativeSelect, Spinner, Text } from "@chakra-ui/react"
import type { ShowDTO } from "@repo/types"
import { fetchShows } from "../../lib/schedulingApi"
import { RoomSetup } from "../../types/Room"

type Props = {
  onChange: (settings: Partial<RoomSetup>) => void
  settings: RoomSetup
}

export default function FormAttachShow({ onChange, settings }: Props) {
  const [shows, setShows] = useState<ShowDTO[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchShows({ status: "ready" })
        if (!cancelled) setShows(list)
      } catch {
        if (!cancelled) setShows([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Field.Root>
      <Field.Label>Attach show (optional)</Field.Label>
      {loading ? (
        <Spinner size="sm" />
      ) : (
        <NativeSelect.Root>
          <NativeSelect.Field
            value={settings.showId ?? ""}
            onChange={(e) => {
              const v = e.target.value
              onChange({ showId: v === "" ? undefined : v })
            }}
          >
            <option value="">None</option>
            {shows.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title} · {new Date(s.startTime).toLocaleString()}
              </option>
            ))}
          </NativeSelect.Field>
          <NativeSelect.Indicator />
        </NativeSelect.Root>
      )}
      <Field.HelperText>
        <Text as="span" fontSize="sm" color="fg.muted">
          Only shows in the ready state are listed. The room stores the show ID only; the timeline is
          loaded when you open the room.
        </Text>
      </Field.HelperText>
    </Field.Root>
  )
}
