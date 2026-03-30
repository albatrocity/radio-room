import { Formik } from "formik"
import React, { useEffect, useState } from "react"
import {
  Button,
  Checkbox,
  DialogBody,
  DialogFooter,
  Field,
  NativeSelect,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react"
import type { ShowDTO } from "@repo/types"
import FormActions from "./FormActions"
import { useModalsSend, useSettings, useAdminSend, useCurrentRoom } from "../../../hooks/useActors"
import { fetchShow, fetchShows } from "../../../lib/schedulingApi"

export default function Schedule() {
  const room = useCurrentRoom()
  const settings = useSettings()
  const modalSend = useModalsSend()
  const send = useAdminSend()
  const [readyShows, setReadyShows] = useState<ShowDTO[]>([])
  const [currentShowLabel, setCurrentShowLabel] = useState<string | null>(null)
  const [loadingShows, setLoadingShows] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const list = await fetchShows({ status: "ready" })
        if (!cancelled) setReadyShows(list)
        if (settings.showId && !list.some((s) => s.id === settings.showId)) {
          const s = await fetchShow(settings.showId, { roomId: room?.id })
          if (!cancelled) setCurrentShowLabel(`${s.title} (${s.status})`)
        } else {
          if (!cancelled) setCurrentShowLabel(null)
        }
      } catch {
        if (!cancelled) {
          setReadyShows([])
          setCurrentShowLabel(null)
        }
      } finally {
        if (!cancelled) setLoadingShows(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [settings.showId, room?.id])

  return (
    <Formik
      initialValues={{
        showId: settings.showId ?? "",
        showSchedulePublic: settings.showSchedulePublic === true,
        announceActiveSegment: settings.announceActiveSegment !== false,
      }}
      enableReinitialize
      validate={() => ({})}
      onSubmit={(values) => {
        send({
          type: "SET_SETTINGS",
          data: {
            showId: values.showId ? values.showId : null,
            showSchedulePublic: values.showSchedulePublic,
            announceActiveSegment: values.announceActiveSegment,
          },
        } as any)
      }}
    >
      {({
        values,
        handleChange,
        handleBlur,
        handleSubmit,
        setTouched,
        initialValues,
        dirty,
      }) => (
        <form onSubmit={handleSubmit}>
          <DialogBody>
            <VStack gap={6} align="stretch">
              {currentShowLabel && (
                <Text fontSize="sm" color="fg.muted">
                  Current attachment is not in the ready list: {currentShowLabel}. Choose a ready show
                  below to replace, or clear the selection.
                </Text>
              )}
              <Field.Root>
                <Field.Label>Attached show</Field.Label>
                {loadingShows ? (
                  <Spinner size="sm" />
                ) : (
                  <NativeSelect.Root>
                    <NativeSelect.Field
                      name="showId"
                      value={values.showId}
                      onBlur={handleBlur}
                      onChange={(e) => {
                        const syntheticEvent = {
                          target: { name: "showId", value: e.target.value },
                        }
                        handleChange(syntheticEvent as any)
                        if (e.target.value !== initialValues.showId) {
                          setTouched({ showId: true })
                        } else {
                          setTouched({ showId: false })
                        }
                      }}
                    >
                      <option value="">None</option>
                      {readyShows.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.title} · {new Date(s.startTime).toLocaleString()}
                        </option>
                      ))}
                    </NativeSelect.Field>
                    <NativeSelect.Indicator />
                  </NativeSelect.Root>
                )}
                <Field.HelperText>Only ready shows are listed for new attachments.</Field.HelperText>
              </Field.Root>

              <Field.Root>
                <Checkbox.Root
                  checked={values.showSchedulePublic}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "showSchedulePublic",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.showSchedulePublic) {
                      setTouched({ showSchedulePublic: true })
                    } else {
                      setTouched({ showSchedulePublic: false })
                    }
                  }}
                  name="showSchedulePublic"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Public schedule timeline</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  When enabled, listeners see the show timeline in the sidebar. Room admins always see
                  it.
                </Field.HelperText>
              </Field.Root>

              <Field.Root>
                <Checkbox.Root
                  checked={values.announceActiveSegment}
                  onCheckedChange={(details) => {
                    const syntheticEvent = {
                      target: {
                        name: "announceActiveSegment",
                        value: details.checked,
                        type: "checkbox",
                        checked: details.checked,
                      },
                    }
                    handleChange(syntheticEvent as any)
                    if (details.checked !== initialValues.announceActiveSegment) {
                      setTouched({ announceActiveSegment: true })
                    } else {
                      setTouched({ announceActiveSegment: false })
                    }
                  }}
                  name="announceActiveSegment"
                >
                  <Checkbox.HiddenInput onBlur={handleBlur} />
                  <Checkbox.Control>
                    <Checkbox.Indicator />
                  </Checkbox.Control>
                  <Checkbox.Label>Announce active segment in chat</Checkbox.Label>
                </Checkbox.Root>
                <Field.HelperText>
                  When enabled, activating a segment posts a system message with the segment title.
                </Field.HelperText>
              </Field.Root>

              {settings.activeSegmentId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  alignSelf="flex-start"
                  onClick={() =>
                    send({ type: "SET_SETTINGS", data: { activeSegmentId: null } } as any)
                  }
                >
                  Clear active segment
                </Button>
              )}
            </VStack>
          </DialogBody>
          <DialogFooter>
            <FormActions
              onCancel={() => modalSend({ type: "CLOSE" })}
              onSubmit={handleSubmit}
              dirty={dirty}
            />
          </DialogFooter>
        </form>
      )}
    </Formik>
  )
}
