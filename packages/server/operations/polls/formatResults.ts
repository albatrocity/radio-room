import type { Poll, PollResults, TextSegment } from "@repo/types"

const DISPLAY_LIMIT = 10

function formatPercent(count: number, totalVotes: number): string {
  if (totalVotes === 0 || count === 0) return "0%"
  const rounded = Math.round((count / totalVotes) * 100)
  if (count > 0 && rounded === 0) return "<1%"
  return `${rounded}%`
}

function winnerMarker(optionId: string, results: PollResults): string {
  if (results.totalVotes === 0 || !results.winners.includes(optionId)) {
    return ""
  }
  return results.winners.length > 1 ? "  [Tied for 1st]" : "  [Winner]"
}

function sortOptionsByTally(poll: Poll, results: PollResults) {
  return [...poll.options].sort((a, b) => {
    const tallyDiff = (results.optionTallies[b.id] ?? 0) - (results.optionTallies[a.id] ?? 0)
    if (tallyDiff !== 0) return tallyDiff
    return poll.options.findIndex((o) => o.id === a.id) - poll.options.findIndex((o) => o.id === b.id)
  })
}

export function formatPollResultsForChat(
  poll: Poll,
  results: PollResults,
): { content: string; contentSegments: TextSegment[] } {
  const sorted = sortOptionsByTally(poll, results)
  const displayed = sorted.slice(0, DISPLAY_LIMIT)
  const hiddenCount = sorted.length - displayed.length

  const lines: string[] = [`Poll: ${poll.question}`]
  const contentSegments: TextSegment[] = [
    {
      text: `Poll: ${poll.question}`,
      effects: [{ type: "size", value: "lg" }],
    },
    { text: "\n" },
  ]

  displayed.forEach((option, index) => {
    const count = results.optionTallies[option.id] ?? 0
    const pct = formatPercent(count, results.totalVotes)
    const marker = winnerMarker(option.id, results)
    const line = `${index + 1}. ${option.label} — ${count} votes (${pct})${marker}`
    lines.push(line)

    contentSegments.push({ text: `${index + 1}. ${option.label} — ${count} votes (${pct})` })
    if (marker) {
      contentSegments.push({
        text: marker.trimStart(),
        effects: [{ type: "color", palette: "green", token: "emphasized" }],
      })
    }
    contentSegments.push({ text: "\n" })
  })

  if (hiddenCount > 0) {
    const footer = `...and ${hiddenCount} more option${hiddenCount === 1 ? "" : "s"}`
    lines.push(footer)
    contentSegments.push({ text: `${footer}\n` })
  }

  const totalLine = `Total: ${results.totalVotes} vote${results.totalVotes === 1 ? "" : "s"}`
  lines.push(totalLine)
  contentSegments.push({ text: totalLine })

  return {
    content: lines.join("\n"),
    contentSegments,
  }
}
