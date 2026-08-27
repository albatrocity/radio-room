import type { ReactNode } from "react"

import { MusicUploadPanel } from "../components/MusicUploadPanel"

export type PluginModalBodyProps = {
  roomId: string
  onClose: () => void
}

export type PluginModalBody = (props: PluginModalBodyProps) => ReactNode

const PLUGIN_MODAL_BODIES: Record<string, PluginModalBody> = {
  "music-upload:upload-modal": ({ roomId, onClose }) => (
    <MusicUploadPanel roomId={roomId} onClose={onClose} />
  ),
}

export function resolvePluginModalBody(
  pluginName: string,
  modalId: string,
): PluginModalBody | null {
  return PLUGIN_MODAL_BODIES[`${pluginName}:${modalId}`] ?? null
}
