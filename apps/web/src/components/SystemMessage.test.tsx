import type { ReactElement } from "react"
import { describe, expect, it, vi } from "vitest"
import { ChakraProvider } from "@chakra-ui/react"
import { renderToStaticMarkup } from "react-dom/server"
import { system } from "../theme/chakraTheme"
import type { ChatMessage } from "../types/ChatMessage"
import SystemMessage from "./SystemMessage"

const harness = vi.hoisted(() => ({ peek: false, username: "ada" as string | undefined }))

vi.mock("../hooks/useActors", () => ({
  useCurrentUser: () => (harness.username ? { userId: "ada", username: harness.username } : null),
}))

vi.mock("../hooks/useHasInventoryPeek", () => ({
  useHasInventoryPeek: () => harness.peek,
}))

vi.mock("../lib/listenerDisplayName", () => ({
  displayNameForUserId: (userId: string) => userId,
}))

vi.mock("./PresentationThemes/registry", async () => {
  const { createElement } = await import("react")
  return {
    getChatTheme: () => () => createElement("div", { "data-road-sign": "info" }),
  }
})

function render(ui: ReactElement) {
  return renderToStaticMarkup(<ChakraProvider value={system}>{ui}</ChakraProvider>)
}

function prose(meta: ChatMessage["meta"], extra: Partial<ChatMessage> = {}): ChatMessage {
  return {
    content: "Somebody pulled off here.",
    timestamp: "2026-10-18T18:00:00.000Z",
    user: { userId: "system" },
    ...extra,
    meta,
  }
}

describe("SystemMessage prose", () => {
  it("highlights a mention and stays a paragraph when a road-trip theme is also set", () => {
    harness.peek = false
    harness.username = "ada"
    const html = render(
      <SystemMessage
        {...prose(
          { type: "prose", status: "warning", theme: "road-trip" },
          { content: "Ada, look at this.", mentions: ["ada"] },
        )}
      />,
    )
    expect(html).toContain('data-mention="true"')
    expect(html).toContain("Ada, look at this.")
    expect(html).not.toContain("data-road-sign")
  })

  it("shows the pierce icon and the real name only while X-Ray is on", () => {
    harness.username = "ada"
    harness.peek = true
    const pierced = render(
      <SystemMessage
        {...prose(
          { type: "prose", maskedUserIds: ["user-1"] },
          { content: "Somebody pulled off here." },
        )}
      />,
    )
    expect(pierced).toContain("user-1 pulled off here.")
    expect(pierced).toContain("<svg")
    expect(pierced).not.toContain("Somebody")

    harness.peek = false
    const plain = render(
      <SystemMessage
        {...prose(
          { type: "prose", maskedUserIds: ["user-1"] },
          { content: "Somebody pulled off here." },
        )}
      />,
    )
    expect(plain).toContain("Somebody pulled off here.")
    expect(plain).not.toContain("<svg")
  })
})
