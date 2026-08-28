import { describe, expect, it } from "vitest"

import {
  PRIMARY_SOLID_CSS_VAR,
  applyBrowserThemeColor,
  readPrimarySolidColor,
} from "./browserThemeColor"

function fakeMetaDocument(existingContents: string[] = []) {
  const removed: string[] = []
  const appended: Array<{ name: string; content: string }> = []
  const metas = existingContents.map((content) => ({
    getAttribute: (name: string) => (name === "content" ? content : "theme-color"),
    remove: () => {
      removed.push(content)
    },
  }))

  const doc = {
    head: {
      querySelectorAll: () => metas,
      appendChild: (el: { name: string; content: string }) => {
        appended.push(el)
      },
    },
    createElement: (tag: string) => {
      const attrs: Record<string, string> = {}
      return {
        tag,
        setAttribute: (name: string, value: string) => {
          attrs[name] = value
        },
        get name() {
          return attrs.name
        },
        get content() {
          return attrs.content
        },
      }
    },
  }

  return { doc: doc as unknown as Document, removed, appended }
}

describe("browserThemeColor", () => {
  it("reads the Chakra primary.solid custom property", () => {
    expect(
      readPrimarySolidColor({
        getPropertyValue: (name) => (name === PRIMARY_SOLID_CSS_VAR ? "  #c71f2e  " : ""),
      }),
    ).toBe("#c71f2e")
    expect(readPrimarySolidColor({ getPropertyValue: () => "   " })).toBeNull()
  })

  it("replaces existing theme-color meta nodes so Safari picks up the new value", () => {
    const { doc, removed, appended } = fakeMetaDocument(["#0093A5"])
    applyBrowserThemeColor("#c71f2e", doc)
    expect(removed).toEqual(["#0093A5"])
    expect(appended).toHaveLength(1)
    expect(appended[0].name).toBe("theme-color")
    expect(appended[0].content).toBe("#c71f2e")
  })
})
