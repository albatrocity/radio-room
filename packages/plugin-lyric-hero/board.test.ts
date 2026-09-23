import { describe, it, expect } from "vitest"
import { applyGuess, createBoard, toPublicPuzzleView } from "./board"

describe("createBoard / applyGuess", () => {
  it("fills every matching token on a hit", () => {
    const board = createBoard("run run away", 6)
    const result = applyGuess(board, "run", "u1", "Alice")
    expect(result).toEqual({ kind: "hit", filledCount: 2, solved: false })
    expect(board.tokens.filter((t) => t.revealed).map((t) => t.surface)).toEqual(["run", "run"])
    expect(board.fillers.u1).toEqual(["run"])
  })

  it("solves when all words are filled", () => {
    const board = createBoard("hi there", 6)
    applyGuess(board, "hi", "u1", "A")
    const result = applyGuess(board, "there", "u2", "B")
    expect(result).toMatchObject({ kind: "hit", solved: true })
    expect(board.solved).toBe(true)
  })

  it("records unique misses and walks out at missMax", () => {
    const board = createBoard("secret", 2)
    expect(applyGuess(board, "nope", "u1", "A")).toEqual({ kind: "miss", walkedOut: false })
    expect(applyGuess(board, "nope", "u1", "A")).toEqual({ kind: "duplicate-miss" })
    expect(applyGuess(board, "wrong", "u1", "A")).toEqual({ kind: "miss", walkedOut: true })
    expect(board.walkedOut).toBe(true)
    expect(board.tokens.every((t) => t.revealed)).toBe(true)
  })

  it("treats already-filled word as duplicate-hit", () => {
    const board = createBoard("hello world", 6)
    applyGuess(board, "hello", "u1", "A")
    expect(applyGuess(board, "hello", "u2", "B")).toEqual({ kind: "duplicate-hit" })
  })

  it("accepts punctuation-free variants of apostrophe words", () => {
    const board = createBoard("Know when to hold 'em", 6)
    expect(applyGuess(board, "em", "u1", "A")).toEqual({
      kind: "hit",
      filledCount: 1,
      solved: false,
    })
    const emToken = board.tokens.find((t) => t.surface === "'em")
    expect(emToken?.revealed).toBe(true)
    expect(emToken?.normalized).toBe("em")
    // applyGuess takes an already-normalized key (parseSingleGuess("'em") → "em")
    expect(applyGuess(board, "em", "u2", "B")).toEqual({ kind: "duplicate-hit" })
  })

  it("public view blanks unrevealed letters", () => {
    const board = createBoard("Hi!", 6)
    const view = toPublicPuzzleView(board)
    expect(view.tokens[0]?.display).toBe("__!")
    expect(view.moodLabel).toBe("locked in")
  })

  it("includes trimmed hint and omits empty hints", () => {
    const board = createBoard("hello", 6)
    expect(toPublicPuzzleView(board, { hint: "Journey" }).hint).toBe("Journey")
    expect(toPublicPuzzleView(board).hint).toBeUndefined()
    expect(toPublicPuzzleView(board, { hint: "" }).hint).toBeUndefined()
  })
})
