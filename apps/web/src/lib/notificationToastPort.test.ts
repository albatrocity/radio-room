import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../components/ui/toaster", () => ({
  toaster: { create: vi.fn(), dismiss: vi.fn() },
}))

vi.mock("./navigateToNotificationTarget", () => ({
  navigateToTarget: vi.fn(),
}))

import { toaster } from "../components/ui/toaster"
import { createNotificationToast } from "./notificationToastPort"
import { resolveToastDuration } from "./toasts"

describe("resolveToastDuration", () => {
  it("maps null to Infinity so the toast stays until dismissed", () => {
    expect(resolveToastDuration(null)).toBe(Infinity)
  })

  it("defaults omitted duration to 5000", () => {
    expect(resolveToastDuration(undefined)).toBe(5000)
  })
})

describe("createNotificationToast", () => {
  beforeEach(() => {
    vi.mocked(toaster.create).mockClear()
  })

  it("keeps gift/trade request toasts sticky and closable", () => {
    createNotificationToast({
      id: "gift-offer-1",
      target: { surface: "gameState", tabId: "trades-gifts" },
      toast: {
        title: "Gift received",
        duration: null,
        action: "open",
      },
    })

    expect(toaster.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "gift-offer-1",
        duration: Infinity,
        closable: true,
        meta: expect.objectContaining({ closable: true }),
      }),
    )
  })
})
