import { beforeEach, describe, expect, it, vi } from "vitest"
import { storeUserServiceAuth } from "./serviceAuthentications"

describe("storeUserServiceAuth", () => {
  const hSet = vi.fn()
  const hGet = vi.fn()
  const context = {
    redis: { pubClient: { hSet, hGet } },
  } as any

  beforeEach(() => {
    vi.clearAllMocks()
    hSet.mockResolvedValue(undefined)
    hGet.mockResolvedValue(undefined)
  })

  it("stores the provided refresh token", async () => {
    await storeUserServiceAuth({
      context,
      userId: "user-1",
      serviceName: "spotify",
      tokens: {
        accessToken: "atok",
        refreshToken: "rtok",
        expiresAt: 123,
      },
    })

    expect(hGet).not.toHaveBeenCalled()
    expect(hSet).toHaveBeenCalledWith("user:user-1:auth:spotify", {
      accessToken: "atok",
      refreshToken: "rtok",
      expiresAt: "123",
      updatedAt: expect.any(String),
      metadata: "",
    })
  })

  it("keeps an existing refresh token when the new one is empty", async () => {
    hGet.mockResolvedValue("existing-rtok")

    await storeUserServiceAuth({
      context,
      userId: "user-1",
      serviceName: "spotify",
      tokens: {
        accessToken: "new-atok",
        refreshToken: "",
        expiresAt: 456,
      },
    })

    expect(hGet).toHaveBeenCalledWith("user:user-1:auth:spotify", "refreshToken")
    expect(hSet).toHaveBeenCalledWith(
      "user:user-1:auth:spotify",
      expect.objectContaining({
        accessToken: "new-atok",
        refreshToken: "existing-rtok",
      }),
    )
  })
})
