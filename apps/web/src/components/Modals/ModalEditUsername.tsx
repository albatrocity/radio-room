import React, { useCallback } from "react"
import FormUsername from "../FormUsername"

import {
  useCurrentUser,
  useAuthSend,
  useModalsSend,
  useIsModalOpen,
  useAudioSend,
} from "../../hooks/useActors"
import { audioActor } from "../../actors/audioActor"
import { roomActor } from "../../actors/roomActor"

// Module-level flag to ensure autoplay only happens once per page load
let hasAttemptedAutoplay = false

function ModalEditUsername() {
  const authSend = useAuthSend()
  const modalSend = useModalsSend()
  const audioSend = useAudioSend()
  const isEditingUsername = useIsModalOpen("username")
  const currentUser = useCurrentUser()
  const hideEditForm = useCallback(() => modalSend({ type: "CLOSE" }), [modalSend])

  const startAudioOnSubmit = useCallback(() => {
    if (hasAttemptedAutoplay) return

    const roomSnap = roomActor.getSnapshot()
    const roomType = roomSnap.context.room?.type
    const hasAudio = roomType === "radio" || roomType === "live"
    if (!hasAudio) return

    const audioSnap = audioActor.getSnapshot()
    const isPlaying = audioSnap.matches({ active: { online: { progress: "playing" } } })
    if (isPlaying) return

    hasAttemptedAutoplay = true
    audioSend({ type: "TOGGLE" })
  }, [audioSend])

  return (
    <FormUsername
      isOpen={isEditingUsername}
      currentUser={currentUser}
      onClose={hideEditForm}
      onBeforeSubmit={startAudioOnSubmit}
      onSubmit={(username) => {
        authSend({
          type: "UPDATE_USERNAME",
          data: username,
        })
        hideEditForm()
      }}
    />
  )
}

export default ModalEditUsername
