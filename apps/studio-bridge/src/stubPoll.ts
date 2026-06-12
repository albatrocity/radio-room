import type { Poll } from "@repo/types/Poll"

/** Stable stub poll for Game Studio → Listening Room preview (`pollPreview=1` on socket connect). */
export function buildStubActivePoll(roomId: string): Poll {
  const now = Date.now()
  return {
    id: "studio-bridge-stub-poll",
    roomId,
    question: "Which track should we play next?",
    options: [
      { id: "stub-opt-a", label: "Option A" },
      { id: "stub-opt-b", label: "Option B" },
      { id: "stub-opt-c", label: "Option C" },
    ],
    status: "open",
    settings: { hideRunningTotal: false },
    createdAt: now,
    createdBy: "studio-bridge",
    publishedAt: now,
    closedAt: null,
    closesAt: null,
  }
}
