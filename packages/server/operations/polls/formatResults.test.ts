import { describe, it, expect } from "vitest"
import type { Poll, PollResults } from "@repo/types"
import { formatPollResultsForChat } from "./formatResults"

function makePoll(optionCount: number): Poll {
  const options = Array.from({ length: optionCount }, (_, i) => ({
    id: `opt-${i}`,
    label: `Option ${i + 1}`,
  }))
  return {
    id: "poll-1",
    roomId: "room-1",
    question: "Favorite?",
    options,
    status: "closed",
    settings: { hideRunningTotal: false },
    createdAt: 1,
    createdBy: "admin",
    publishedAt: 1,
    closedAt: 2,
    closesAt: null,
  }
}

function makeResults(
  poll: Poll,
  tallies: Record<string, number>,
  winners: string[],
): PollResults {
  const totalVotes = Object.values(tallies).reduce((sum, n) => sum + n, 0)
  const optionTallies: Record<string, number> = {}
  for (const option of poll.options) {
    optionTallies[option.id] = tallies[option.id] ?? 0
  }
  return {
    pollId: poll.id,
    totalVotes,
    optionTallies,
    winners,
    closedAt: 2,
  }
}

describe("formatPollResultsForChat", () => {
  it("formats zero-vote poll with empty winners", () => {
    const poll = makePoll(2)
    const results = makeResults(poll, { "opt-0": 0, "opt-1": 0 }, [])

    const { content } = formatPollResultsForChat(poll, results)

    expect(content).toContain("Poll: Favorite?")
    expect(content).toContain("Option 1 — 0 votes (0%)")
    expect(content).toContain("Option 2 — 0 votes (0%)")
    expect(content).toContain("Total: 0 votes")
    expect(content).not.toContain("[Winner]")
  })

  it("formats a single winner", () => {
    const poll = makePoll(3)
    const results = makeResults(poll, { "opt-0": 5, "opt-1": 2, "opt-2": 0 }, ["opt-0"])

    const { content } = formatPollResultsForChat(poll, results)

    expect(content.indexOf("Option 1")).toBeLessThan(content.indexOf("Option 2"))
    expect(content).toContain("Option 1 — 5 votes (71%)  [Winner]")
    expect(content).toContain("Total: 7 votes")
  })

  it("marks ties at the top with [Tied for 1st]", () => {
    const poll = makePoll(3)
    const results = makeResults(poll, { "opt-0": 2, "opt-1": 2, "opt-2": 1 }, ["opt-0", "opt-1"])

    const { content } = formatPollResultsForChat(poll, results)

    expect(content).toContain("Option 1 — 2 votes (40%)  [Tied for 1st]")
    expect(content).toContain("Option 2 — 2 votes (40%)  [Tied for 1st]")
    expect(content).toContain("Option 3 — 1 votes")
  })

  it("uses <1% for tiny non-zero percentages", () => {
    const poll = makePoll(2)
    const results = makeResults(poll, { "opt-0": 1, "opt-1": 332 }, ["opt-1"])

    const { content } = formatPollResultsForChat(poll, results)

    expect(content).toContain("Option 1 — 1 votes (<1%)")
    expect(content).toContain("Option 2 — 332 votes (100%)  [Winner]")
  })

  it("includes zero-vote options in the displayed top 10", () => {
    const poll = makePoll(3)
    const results = makeResults(poll, { "opt-0": 3, "opt-1": 0, "opt-2": 0 }, ["opt-0"])

    const { content } = formatPollResultsForChat(poll, results)

    expect(content).toContain("Option 2 — 0 votes (0%)")
    expect(content).toContain("Option 3 — 0 votes (0%)")
  })

  it("keeps stable ordering among equal tallies", () => {
    const poll = makePoll(3)
    const results = makeResults(poll, { "opt-0": 1, "opt-1": 1, "opt-2": 1 }, [
      "opt-0",
      "opt-1",
      "opt-2",
    ])

    const { content } = formatPollResultsForChat(poll, results)

    expect(content.indexOf("Option 1")).toBeLessThan(content.indexOf("Option 2"))
    expect(content.indexOf("Option 2")).toBeLessThan(content.indexOf("Option 3"))
  })

  it("truncates to top 10 with an and-N-more footer", () => {
    const poll = makePoll(12)
    const tallies: Record<string, number> = {}
    poll.options.forEach((o, i) => {
      tallies[o.id] = 12 - i
    })
    const results = makeResults(poll, tallies, ["opt-0"])

    const { content } = formatPollResultsForChat(poll, results)

    expect(content.match(/^\d+\./gm)?.length).toBe(10)
    expect(content).toContain("...and 2 more options")
    expect(content).not.toContain("Option 12")
  })

  it("produces contentSegments with emphasized question and winner marker", () => {
    const poll = makePoll(2)
    const results = makeResults(poll, { "opt-0": 2, "opt-1": 1 }, ["opt-0"])

    const { contentSegments } = formatPollResultsForChat(poll, results)

    expect(contentSegments[0]?.effects?.some((e) => e.type === "size")).toBe(true)
    expect(
      contentSegments.some(
        (s) => s.text.includes("[Winner]") && s.effects?.some((e) => e.type === "color"),
      ),
    ).toBe(true)
  })
})
