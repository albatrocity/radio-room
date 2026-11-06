import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChakraProvider } from "@chakra-ui/react"
import { renderToStaticMarkup } from "react-dom/server"
import type { Poll } from "@repo/types/Poll"
import { system } from "../../theme/chakraTheme"
import { PollVotingSection } from "./PollVotingSection"

vi.mock("../../hooks/useReducedMotion", () => ({
  useAnimationsEnabled: () => false,
}))

function render(ui: ReactElement) {
  return renderToStaticMarkup(<ChakraProvider value={system}>{ui}</ChakraProvider>)
}

function poll(options: Poll["options"]): Poll {
  return {
    id: "poll-1",
    roomId: "room-1",
    question: "Pull off?",
    options,
    status: "open",
    settings: { hideRunningTotal: true },
    createdAt: 0,
    createdBy: "host",
    publishedAt: 0,
    closedAt: null,
    closesAt: null,
  }
}

const two = [
  { id: "stop", label: "Pull off" },
  { id: "skip", label: "Keep driving" },
]

describe("PollVotingSection option layout", () => {
  it("marks a two-option trip poll to sit side by side when the chat column is wide", () => {
    const html = render(
      <PollVotingSection
        poll={poll(two)}
        myVote={null}
        totalVotes={null}
        votePending={false}
        confirmOptionId={null}
        onVote={() => {}}
        pairOptions
      />,
    )
    expect(html).toContain('data-option-layout="pair"')
    expect(html).toContain("@container chat (min-width: 30rem)")
    expect(html).toContain("flex-direction:row")
    expect(html).not.toContain("row-reverse")
    expect(html).toContain("Pull off")
    expect(html).toContain("Keep driving")
  })

  it("puts the first option on the right of a pull-off row", () => {
    const html = render(
      <PollVotingSection
        poll={poll(two)}
        myVote={null}
        totalVotes={null}
        votePending={false}
        confirmOptionId={null}
        onVote={() => {}}
        pairOptions
        exitOnRight
      />,
    )
    expect(html).toContain('data-option-layout="pair-exit-right"')
    expect(html).toContain("flex-direction:row-reverse")
  })

  it("keeps other polls stacked", () => {
    const html = render(
      <PollVotingSection
        poll={poll(two)}
        myVote={null}
        totalVotes={null}
        votePending={false}
        confirmOptionId={null}
        onVote={() => {}}
      />,
    )
    expect(html).toContain('data-option-layout="stack"')
    expect(html).not.toContain("@container chat")
  })
})
