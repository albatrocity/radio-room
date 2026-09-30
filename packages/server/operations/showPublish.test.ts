import { describe, it, expect } from "vitest"
import { finalizeShowPublish, continuePrepareShowPublish } from "./showPublish"
import * as scheduling from "../services/SchedulingService"
import type { AppContext } from "@repo/types"

describe("finalizeShowPublish", () => {
  it("rejects whitespace-only markdown before touching the database", async () => {
    await expect(
      finalizeShowPublish("any-id", "  \n\t  ", {} as AppContext),
    ).rejects.toThrow(scheduling.SchedulingBadRequestError)

    await expect(finalizeShowPublish("any-id", "  \n\t  ", {} as AppContext)).rejects.toThrow(
      /Markdown cannot be empty/,
    )
  })
})

describe("continuePrepareShowPublish", () => {
  it("rejects invalid body before loading the show", async () => {
    await expect(
      continuePrepareShowPublish("any-id", { orderedTrackKeys: "nope" }, {} as AppContext),
    ).rejects.toThrow(scheduling.SchedulingBadRequestError)
  })
})
