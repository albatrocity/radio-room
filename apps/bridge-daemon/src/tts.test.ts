import { describe, expect, it } from "vitest"
import { parseMpvAudioDevicesOutput, parseSayVoicesOutput } from "./tts"

describe("parseSayVoicesOutput", () => {
  it("parses English voices and drops other locales", () => {
    const stdout = `
Alex                en_US    # Most people recognize me by my voice.
Bad News            en_US    # 
Samantha            en_US    # Hello! My name is Samantha.
Daniel              en_GB    #
Zarvox              en_US    #
Thomas              fr_FR    #
Anna                de_DE    #
Kyoko               ja_JP    #
`
    expect(parseSayVoicesOutput(stdout)).toEqual([
      { id: "Alex", name: "Alex", locale: "en_US" },
      { id: "Bad News", name: "Bad News", locale: "en_US" },
      { id: "Samantha", name: "Samantha", locale: "en_US" },
      { id: "Daniel", name: "Daniel", locale: "en_GB" },
      { id: "Zarvox", name: "Zarvox", locale: "en_US" },
    ])
  })
})

describe("parseMpvAudioDevicesOutput", () => {
  it("skips auto and parses coreaudio devices (unquoted)", () => {
    const raw = `
List of detected audio devices:
  auto (Autoselect device)
  coreaudio (CoreAudio)
  coreaudio/BlackHole2ch_UID (BlackHole 2ch)
`
    expect(parseMpvAudioDevicesOutput(raw)).toEqual([
      { id: "coreaudio", label: "CoreAudio" },
      { id: "coreaudio/BlackHole2ch_UID", label: "BlackHole 2ch" },
    ])
  })

  it("strips mpv 0.39+ quotes around device ids", () => {
    const raw = `
List of detected audio devices:
  'auto' (Autoselect device)
  'coreaudio' (CoreAudio)
  'coreaudio/BlackHole2ch_UID' (BlackHole 2ch)
`
    expect(parseMpvAudioDevicesOutput(raw)).toEqual([
      { id: "coreaudio", label: "CoreAudio" },
      { id: "coreaudio/BlackHole2ch_UID", label: "BlackHole 2ch" },
    ])
  })

  it("prefers coreaudio and drops avfoundation mirrors", () => {
    const raw = `
  'coreaudio/BuiltInSpeakerDevice' (MacBook Pro Speakers)
  'avfoundation/BuiltInSpeakerDevice' (MacBook Pro Speakers)
`
    expect(parseMpvAudioDevicesOutput(raw)).toEqual([
      { id: "coreaudio/BuiltInSpeakerDevice", label: "MacBook Pro Speakers" },
    ])
  })
})

describe("normalizeTtsAudioDevice", () => {
  it("strips quotes and rejects auto", async () => {
    const { normalizeTtsAudioDevice } = await import("./tts")
    expect(normalizeTtsAudioDevice("'auto'")).toBeUndefined()
    expect(normalizeTtsAudioDevice("auto")).toBeUndefined()
    expect(normalizeTtsAudioDevice("'coreaudio/BlackHole2ch_UID'")).toBe(
      "coreaudio/BlackHole2ch_UID",
    )
    expect(normalizeTtsAudioDevice("coreaudio/BlackHole2ch_UID")).toBe(
      "coreaudio/BlackHole2ch_UID",
    )
  })
})
