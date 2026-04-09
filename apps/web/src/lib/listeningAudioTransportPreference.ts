export type ListeningAudioTransport = "shoutcast" | "webrtc"

let preferred: ListeningAudioTransport = "shoutcast"

export function setListeningAudioTransportPreference(t: ListeningAudioTransport) {
  preferred = t
}

export function getListeningAudioTransportForSocket(): ListeningAudioTransport {
  return preferred
}
