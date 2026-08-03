import { describe, expect, it } from "vitest"
import { resolveLocalDisplayTitle, titleFromFilename } from "./local"

describe("titleFromFilename", () => {
  it("strips directory and extension", () => {
    expect(titleFromFilename("Artist/Album/My Song.mp3")).toBe("My Song")
    expect(titleFromFilename("C:\\Music\\track.flac")).toBe("track")
  })

  it("handles missing path", () => {
    expect(titleFromFilename(undefined)).toBeUndefined()
    expect(titleFromFilename("")).toBeUndefined()
  })
})

describe("resolveLocalDisplayTitle", () => {
  it("prefers real tags", () => {
    expect(resolveLocalDisplayTitle({ id: "abc", title: "Real Title", path: "x/y.mp3" })).toBe(
      "Real Title",
    )
  })

  it("uses filename when title missing or Unknown", () => {
    expect(resolveLocalDisplayTitle({ id: "abc", path: "folder/Cool Tune.wav" })).toBe("Cool Tune")
    expect(
      resolveLocalDisplayTitle({ id: "abc", title: "Unknown", path: "folder/Cool Tune.wav" }),
    ).toBe("Cool Tune")
  })

  it("uses filename when title is the navidrome id stub", () => {
    expect(
      resolveLocalDisplayTitle({
        id: "eDwCKmCikoLMfWhBVT4unY",
        title: "eDwCKmCikoLMfWhBVT4unY",
        path: "DJ Sets/Friday Night.m4a",
      }),
    ).toBe("Friday Night")
  })
})
