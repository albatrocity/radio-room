import { describe, expect, it, vi } from "vitest"
import { userFactory } from "@repo/factories"
import {
  createMockDefinition,
  createMockDeps,
  invokeUse,
  stubRoomUsers,
} from "../shared/testHelpers"
import { burnerPhone } from "./index"

describe("burner-phone", () => {
  it("registers the expected catalog fields", () => {
    expect(burnerPhone.shortId).toBe("burner-phone")
    expect(burnerPhone.catalogEntry.definition.requiresTarget).toBe("spokenMessage")
    expect(burnerPhone.catalogEntry.availableInRoomTypes).toEqual(["radio", "live"])
  })

  it("rejects missing message without consuming", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(burnerPhone.shortId)

    const result = await invokeUse(burnerPhone, deps, actor.userId, def, { voice: "Samantha" })
    expect(result).toEqual({
      success: false,
      consumed: false,
      message: "Enter a message to send.",
    })
    expect(deps.context.api.speakOnMediaBridge).not.toHaveBeenCalled()
  })

  it("rejects over-length message without consuming", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build()
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(burnerPhone.shortId)
    const message = "x".repeat(101)

    const result = await invokeUse(burnerPhone, deps, actor.userId, def, {
      message,
      voice: "Samantha",
    })
    expect(result.success).toBe(false)
    expect(result.consumed).toBe(false)
    expect(deps.context.api.speakOnMediaBridge).not.toHaveBeenCalled()
  })

  it("does not consume when bridge speak fails", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "Alice" })
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(burnerPhone.shortId)
    vi.mocked(deps.context.api.speakOnMediaBridge).mockResolvedValue({
      ok: false,
      message: "No TTS audio device configured.",
    })

    const result = await invokeUse(burnerPhone, deps, actor.userId, def, {
      message: "Hello DJ",
      voice: "Zarvox",
    })
    expect(result).toEqual({
      success: false,
      consumed: false,
      message: "No TTS audio device configured.",
    })
    expect(deps.context.api.sendSystemMessage).not.toHaveBeenCalled()
  })

  it("consumes and posts attributed system message on success", async () => {
    const deps = createMockDeps()
    const actor = userFactory.build({ username: "Alice" })
    stubRoomUsers(deps, [actor])
    const def = createMockDefinition(burnerPhone.shortId)
    vi.mocked(deps.context.api.speakOnMediaBridge).mockResolvedValue({ ok: true })

    const result = await invokeUse(burnerPhone, deps, actor.userId, def, {
      message: "  Hello DJ  ",
      voice: "Samantha",
    })

    expect(result).toEqual({
      success: true,
      consumed: true,
      message: "Your call is going through.",
    })
    expect(deps.context.api.speakOnMediaBridge).toHaveBeenCalledWith(deps.context.roomId, {
      text: "Hello DJ",
      voice: "Samantha",
    })
    expect(deps.context.api.sendSystemMessage).toHaveBeenCalledWith(
      deps.context.roomId,
      "Alice put a call through on a burner phone.",
    )
  })
})
