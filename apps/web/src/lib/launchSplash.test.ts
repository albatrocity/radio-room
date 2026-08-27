import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"

import { APP_SPLASH_ID, LAUNCH_SPLASH_ATTR, dismissLaunchSplash } from "./launchSplash"

const indexHtml = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../index.html"),
  "utf8",
)

describe("launch splash", () => {
  it("inlines a teal logo placeholder beside #root", () => {
    expect(indexHtml).toContain(`id="${APP_SPLASH_ID}"`)
    expect(indexHtml).toContain('id="root"')
    expect(indexHtml.indexOf(`id="${APP_SPLASH_ID}"`)).toBeLessThan(indexHtml.indexOf('id="root"'))
    expect(indexHtml).toContain(LAUNCH_SPLASH_ATTR)
    expect(indexHtml).toMatch(
      /html\[data-launch-splash\][\s\S]*html\[data-launch-splash\] body\s*\{[^}]*background:\s*#0093a5/,
    )
    expect(indexHtml).toContain('rel="apple-touch-startup-image"')
    expect(indexHtml).toContain('fill="#feb216"')
  })

  it("dismissLaunchSplash removes the placeholder node and html attribute", () => {
    const remove = vi.fn()
    const removeAttribute = vi.fn()
    const root = {
      querySelector: vi.fn(() => ({ remove })),
      documentElement: { removeAttribute },
    }
    dismissLaunchSplash(root as unknown as ParentNode)
    expect(root.querySelector).toHaveBeenCalledWith(`#${APP_SPLASH_ID}`)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(removeAttribute).toHaveBeenCalledWith(LAUNCH_SPLASH_ATTR)
  })

  it("dismissLaunchSplash is a no-op when the node is gone", () => {
    const root = { querySelector: vi.fn(() => null) }
    expect(() => dismissLaunchSplash(root as unknown as ParentNode)).not.toThrow()
  })
})
