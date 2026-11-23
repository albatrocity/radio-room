import { describe, expect, it } from "vitest"
import { createActor } from "xstate"
import { voicemailTransportMachine } from "./voicemailTransportMachine"

function start() {
  return createActor(voicemailTransportMachine).start()
}

const play = {
  id: "vm-1",
  url: "https://example.test/vm.webm",
  durationMs: 12_000,
}

describe("voicemailTransportMachine", () => {
  it("gives a successful bridge play to the bridge only", () => {
    const actor = start()
    actor.send({ type: "PLAY_RESULT", data: { ...play, bridge: true } })
    expect(actor.getSnapshot().context).toMatchObject({
      owner: "bridge",
      selectedId: "vm-1",
      playbackUrl: play.url,
      playing: false,
    })
  })

  it("gives a failed bridge attempt to the local element", () => {
    const actor = start()
    actor.send({ type: "PLAY_RESULT", data: { ...play, bridge: false } })
    expect(actor.getSnapshot().context.owner).toBe("local")
  })

  it("ignores local element events while the bridge owns playback", () => {
    const actor = start()
    actor.send({ type: "PLAY_RESULT", data: { ...play, bridge: true } })
    actor.send({
      type: "PLAYBACK_POLL",
      data: { observed: true, state: "playing", progressMs: 400, durationMs: 12_000 },
    })
    actor.send({ type: "LOCAL_PLAYING", playing: false })
    actor.send({ type: "LOCAL_TIME", positionMs: 0 })
    expect(actor.getSnapshot().context).toMatchObject({
      owner: "bridge",
      playing: true,
      positionMs: 400,
    })
  })

  it("hands an unobserved poll back to the local element", () => {
    const actor = start()
    actor.send({ type: "PLAY_RESULT", data: { ...play, bridge: true } })
    actor.send({
      type: "PLAYBACK_POLL",
      data: { observed: false, state: "stopped", progressMs: null, durationMs: null },
    })
    expect(actor.getSnapshot().context.owner).toBe("local")
    expect(actor.getSnapshot().context.playbackUrl).toBe(play.url)
  })

  it("drops the player when the selected row is hidden", () => {
    const actor = start()
    actor.send({ type: "PLAY_RESULT", data: { ...play, bridge: true } })
    actor.send({ type: "HIDDEN", id: "other" })
    expect(actor.getSnapshot().context.owner).toBe("bridge")
    actor.send({ type: "HIDDEN", id: "vm-1" })
    expect(actor.getSnapshot().context).toMatchObject({
      owner: "idle",
      selectedId: null,
      playbackUrl: null,
    })
  })
})
