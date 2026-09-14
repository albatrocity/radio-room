import { describe, it, expect } from "vitest"
import { crowdMoodFeedback, crowdMoodLine, moodLabelForMisses } from "./crowdMood"

describe("crowdMood", () => {
  it("labels moods by miss count", () => {
    expect(moodLabelForMisses(0, 6)).toBe("locked in")
    expect(moodLabelForMisses(1, 6)).toBe("restless")
    expect(moodLabelForMisses(3, 6)).toBe("losing interest")
    expect(moodLabelForMisses(5, 6)).toBe("booing")
    expect(moodLabelForMisses(6, 6)).toBe("walking out")
  })

  it("includes username in lines", () => {
    expect(crowdMoodLine({ kind: "hit", username: "Ross", missesUsed: 0, missMax: 6 })).toContain(
      "Ross",
    )
    expect(crowdMoodLine({ kind: "miss", username: "Ross", missesUsed: 1, missMax: 6 })).toMatch(
      /sour note/i,
    )
    expect(
      crowdMoodLine({ kind: "walkout", username: "Ross", missesUsed: 6, missMax: 6 }),
    ).toContain("leaving")
  })

  it("pairs each mood line with a CDN sfx url", () => {
    expect(crowdMoodFeedback({ kind: "hit", username: "Ross", missesUsed: 0, missMax: 6 })).toEqual(
      {
        line: expect.stringContaining("Ross"),
        soundUrl: "https://cdn.listeningroom.club/assets/sfx/vox-woouhh.mp3",
      },
    )
    expect(
      crowdMoodFeedback({ kind: "hit", username: "Ross", missesUsed: 1, missMax: 6 }).soundUrl,
    ).toBe("https://cdn.listeningroom.club/assets/sfx/vox-woouhh.mp3")
    expect(
      crowdMoodFeedback({ kind: "miss", username: "Ross", missesUsed: 1, missMax: 6 }).soundUrl,
    ).toBe("https://cdn.listeningroom.club/assets/sfx/vox-sour.mp3")
    expect(
      crowdMoodFeedback({ kind: "miss", username: "Ross", missesUsed: 5, missMax: 6 }).soundUrl,
    ).toBe("https://cdn.listeningroom.club/assets/sfx/crowd-boo.mp3")
    expect(
      crowdMoodFeedback({ kind: "walkout", username: "Ross", missesUsed: 6, missMax: 6 }).soundUrl,
    ).toBe("https://cdn.listeningroom.club/assets/sfx/vox-bye-bye.mp3")
  })

  it("always plays vox-yeah when the puzzle is solved", () => {
    expect(
      crowdMoodFeedback({
        kind: "hit",
        username: "Ross",
        missesUsed: 5,
        missMax: 6,
        solved: true,
      }).soundUrl,
    ).toBe("https://cdn.listeningroom.club/assets/sfx/vox-yeah.mp3")
    expect(
      crowdMoodFeedback({
        kind: "hit",
        username: "Ross",
        missesUsed: 0,
        missMax: 6,
        solved: true,
      }).soundUrl,
    ).toBe("https://cdn.listeningroom.club/assets/sfx/vox-yeah.mp3")
    expect(
      crowdMoodFeedback({
        kind: "hit",
        username: "Ross",
        missesUsed: 3,
        missMax: 6,
        solved: true,
      }).line,
    ).toMatch(/finished the lyric/i)
  })
})
