import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  EMPTY_POLL_DRAFT,
  getPollDraft,
  setPollDraft,
  clearPollDraft,
  readPollDraftIndex,
  writePollDraftIndex,
} from "./pollDraftPreference"

describe("pollDraftPreference", () => {
  let store: Record<string, string>

  beforeEach(() => {
    store = {}
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => {
        store[key] = value
      },
      removeItem: (key: string) => {
        delete store[key]
      },
    })
  })

  it("returns null when no draft is stored", () => {
    expect(getPollDraft("room-1")).toBeNull()
  })

  it("persists and restores a draft", () => {
    const draft = {
      question: "Favorite genre?",
      options: ["Rock", "Jazz", "Pop"],
      hideRunningTotal: true,
    }
    setPollDraft("room-1", draft)
    expect(getPollDraft("room-1")).toEqual(draft)
  })

  it("clears draft on successful publish helper", () => {
    setPollDraft("room-1", { ...EMPTY_POLL_DRAFT, question: "Q?" })
    clearPollDraft("room-1")
    expect(getPollDraft("room-1")).toBeNull()
    expect(readPollDraftIndex()).not.toContain("room-1")
  })

  it("evicts oldest entries past 100 in the LRU index", () => {
    for (let i = 0; i < 101; i++) {
      setPollDraft(`room-${i}`, { ...EMPTY_POLL_DRAFT, question: `Q${i}` })
    }
    expect(getPollDraft("room-0")).toBeNull()
    expect(getPollDraft("room-100")).not.toBeNull()
    expect(readPollDraftIndex()).toHaveLength(100)
  })

  it("exposes index helpers for tests", () => {
    writePollDraftIndex(["room-a", "room-b"])
    expect(readPollDraftIndex()).toEqual(["room-a", "room-b"])
  })
})
