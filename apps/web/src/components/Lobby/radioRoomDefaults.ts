import type { StationProtocol } from "../../types/StationProtocol"

export const PUBLIC_RADIO_META_URL = "http://live.rcast.net:8678"
export const PUBLIC_RADIO_LISTEN_URL = "https://stream1.rcast.net/66341"
export const PUBLIC_RADIO_PROTOCOL: StationProtocol = "shoutcastv2"

export type DevRadioEnv = {
  metaUrl?: string
  listenUrl?: string
  protocol?: string
}

export type RadioRoomUrlDefaults = {
  radioMetaUrl: string
  radioListenUrl: string
  radioProtocol: StationProtocol
}

const PROTOCOLS = new Set<StationProtocol>([
  "shoutcastv1",
  "shoutcastv2",
  "icecast",
  "raw",
])

function asProtocol(value: string | undefined): StationProtocol | undefined {
  if (!value) return undefined
  return PROTOCOLS.has(value as StationProtocol) ? (value as StationProtocol) : undefined
}

/**
 * Resolve create-room radio URL defaults.
 * When `VITE_DEV_RADIO_*` is set, prefer the local fake station (`raw` unless overridden).
 */
export function resolveRadioRoomDefaults(env: DevRadioEnv = {}): RadioRoomUrlDefaults {
  const metaUrl = env.metaUrl?.trim()
  const listenUrl = env.listenUrl?.trim()
  const hasDevRadio = Boolean(metaUrl || listenUrl)
  const protocol =
    asProtocol(env.protocol?.trim()) ?? (hasDevRadio ? "raw" : PUBLIC_RADIO_PROTOCOL)

  return {
    radioMetaUrl: metaUrl || PUBLIC_RADIO_META_URL,
    radioListenUrl: listenUrl || PUBLIC_RADIO_LISTEN_URL,
    radioProtocol: protocol,
  }
}

/** Read Vite env for create-room radio prefill (empty when unset). */
export function readDevRadioEnvFromVite(
  viteEnv: Record<string, string | boolean | undefined> = import.meta.env,
): DevRadioEnv {
  return {
    metaUrl:
      typeof viteEnv.VITE_DEV_RADIO_META_URL === "string"
        ? viteEnv.VITE_DEV_RADIO_META_URL
        : undefined,
    listenUrl:
      typeof viteEnv.VITE_DEV_RADIO_LISTEN_URL === "string"
        ? viteEnv.VITE_DEV_RADIO_LISTEN_URL
        : undefined,
    protocol:
      typeof viteEnv.VITE_DEV_RADIO_PROTOCOL === "string"
        ? viteEnv.VITE_DEV_RADIO_PROTOCOL
        : undefined,
  }
}
