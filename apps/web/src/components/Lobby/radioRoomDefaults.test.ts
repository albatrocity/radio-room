import { describe, expect, it } from "vitest"
import {
  PUBLIC_RADIO_LISTEN_URL,
  PUBLIC_RADIO_META_URL,
  PUBLIC_RADIO_PROTOCOL,
  readDevRadioEnvFromVite,
  resolveRadioRoomDefaults,
} from "./radioRoomDefaults"

describe("resolveRadioRoomDefaults", () => {
  it("keeps public rcast defaults when no env is set", () => {
    expect(resolveRadioRoomDefaults({})).toEqual({
      radioMetaUrl: PUBLIC_RADIO_META_URL,
      radioListenUrl: PUBLIC_RADIO_LISTEN_URL,
      radioProtocol: PUBLIC_RADIO_PROTOCOL,
    })
  })

  it("prefills from env and defaults protocol to raw", () => {
    expect(
      resolveRadioRoomDefaults({
        metaUrl: "http://dev-radio:8010/stream",
        listenUrl: "http://127.0.0.1:8010/stream",
      }),
    ).toEqual({
      radioMetaUrl: "http://dev-radio:8010/stream",
      radioListenUrl: "http://127.0.0.1:8010/stream",
      radioProtocol: "raw",
    })
  })

  it("honors an explicit protocol override", () => {
    expect(
      resolveRadioRoomDefaults({
        metaUrl: "http://127.0.0.1:8010/stream",
        protocol: "shoutcastv2",
      }),
    ).toMatchObject({
      radioMetaUrl: "http://127.0.0.1:8010/stream",
      radioProtocol: "shoutcastv2",
    })
  })

  it("ignores unknown protocol values", () => {
    expect(
      resolveRadioRoomDefaults({
        listenUrl: "http://127.0.0.1:8010/stream",
        protocol: "not-a-protocol",
      }).radioProtocol,
    ).toBe("raw")
  })
})

describe("readDevRadioEnvFromVite", () => {
  it("reads VITE_DEV_RADIO_* strings", () => {
    expect(
      readDevRadioEnvFromVite({
        VITE_DEV_RADIO_META_URL: "http://meta",
        VITE_DEV_RADIO_LISTEN_URL: "http://listen",
        VITE_DEV_RADIO_PROTOCOL: "raw",
      }),
    ).toEqual({
      metaUrl: "http://meta",
      listenUrl: "http://listen",
      protocol: "raw",
    })
  })
})
