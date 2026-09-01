import { describe, expect, it, beforeEach } from "vitest"
import { Howler } from "howler"
import { ensureHowlerHtml5Cors } from "./howlerHtml5Cors"

describe("ensureHowlerHtml5Cors", () => {
  beforeEach(() => {
    const howler = Howler as typeof Howler & {
      __listeningRoomCorsPatched?: boolean
      _obtainHtml5Audio: () => HTMLAudioElement
      _html5AudioPool?: HTMLAudioElement[]
    }
    howler.__listeningRoomCorsPatched = false
    howler._html5AudioPool = []
    howler._obtainHtml5Audio = () => ({ crossOrigin: null } as HTMLAudioElement)
  })

  it("is idempotent and stamps crossOrigin on obtained audio", () => {
    ensureHowlerHtml5Cors()
    ensureHowlerHtml5Cors()

    const howler = Howler as typeof Howler & {
      _obtainHtml5Audio: () => HTMLAudioElement
    }
    const audio = howler._obtainHtml5Audio()
    expect(audio.crossOrigin).toBe("anonymous")
  })

  it("patches existing pool entries", () => {
    const pooled = { crossOrigin: null } as HTMLAudioElement
    const howler = Howler as typeof Howler & {
      __listeningRoomCorsPatched?: boolean
      _html5AudioPool?: HTMLAudioElement[]
      _obtainHtml5Audio: () => HTMLAudioElement
    }
    howler.__listeningRoomCorsPatched = false
    howler._html5AudioPool = [pooled]
    howler._obtainHtml5Audio = () => pooled

    ensureHowlerHtml5Cors()
    expect(pooled.crossOrigin).toBe("anonymous")
  })
})
