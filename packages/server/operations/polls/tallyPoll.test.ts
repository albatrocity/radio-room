import { describe, it, expect, beforeEach } from "vitest"
import type { AppContext } from "@repo/types"
import { MemoryRedisClient } from "../../test-utils/MemoryRedisClient"
import { tallyPoll, tallyVotes } from "./tallyPoll"

function makeContext(client: MemoryRedisClient): AppContext {
  return {
    redis: {
      pubClient: client as unknown as AppContext["redis"]["pubClient"],
      subClient: client as unknown as AppContext["redis"]["subClient"],
    },
  } as AppContext
}

describe("tallyVotes", () => {
  it("counts votes per optionId", () => {
    expect(
      tallyVotes({
        a: "yes",
        b: "yes",
        c: "no",
      }),
    ).toEqual({ yes: 2, no: 1 })
  })

  it("excludes listed user ids", () => {
    expect(
      tallyVotes(
        {
          dj: "yes",
          a: "yes",
          b: "no",
        },
        { excludeUserIds: ["dj"] },
      ),
    ).toEqual({ yes: 1, no: 1 })
  })

  it("returns empty for no votes", () => {
    expect(tallyVotes({})).toEqual({})
  })
})

describe("tallyPoll", () => {
  let client: MemoryRedisClient
  let context: AppContext

  beforeEach(() => {
    client = new MemoryRedisClient()
    context = makeContext(client)
  })

  it("loads votes from Redis and tallies with exclusions", async () => {
    const votesKey = "room:room-1:poll:poll-1:votes"
    await client.hSet(votesKey, { dj: "yes", a: "yes", b: "no" })

    const counts = await tallyPoll({
      context,
      roomId: "room-1",
      pollId: "poll-1",
      excludeUserIds: ["dj"],
    })
    expect(counts).toEqual({ yes: 1, no: 1 })
  })
})
