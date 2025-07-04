import { create } from "../controllers/roomsController"
import httpMocks from "node-mocks-http"
import { checkUserChallenge } from "../operations/userChallenge"
import { saveRoom } from "../operations/data"
import { vi } from "vitest"

const mockCheckUserChallenge = vi.hoisted(() => vi.fn())

vi.mock("../operations/userChallenge", () => ({
  checkUserChallenge: mockCheckUserChallenge,
}))
vi.mock("../operations/createRoom", async (importOriginal) => {
  const mod = await importOriginal<object>()
  return {
    ...mod,
    createRoomId: vi.fn(() => "roomId"),
    persistRoom: vi.fn(),
  }
})
vi.mock("../operations/data")

describe("create", () => {
  it("should check user challenge", async () => {
    const request = httpMocks.createRequest({
      method: "POST",
      url: "/rooms",
      body: {
        challenge: "challenge",
        userId: "userId",
        title: "Green Room",
        type: "jukebox",
      },
    })

    const response = httpMocks.createResponse()

    await create(request, response)
    expect(checkUserChallenge).toHaveBeenCalledWith({
      challenge: "challenge",
      userId: "userId",
    })
  })

  it("return 401 if challenge doesn't match", async () => {
    const request = httpMocks.createRequest({
      method: "POST",
      url: "/rooms",
      body: {
        challenge: "challenge",
        userId: "userId",
        title: "Green Room",
        type: "jukebox",
      },
    })

    const response = httpMocks.createResponse()
    mockCheckUserChallenge.mockRejectedValue("Unauthorized")

    await create(request, response)
    expect(response.statusCode).toBe(401)
  })

  it("writes to redis", async () => {
    const request = httpMocks.createRequest({
      method: "POST",
      url: "/rooms",
      body: {
        challenge: "challenge",
        userId: "userId",
        title: "Green Room",
        type: "jukebox",
      },
    })

    const response = httpMocks.createResponse()
    mockCheckUserChallenge.mockResolvedValue(1)

    await create(request, response)
    expect(saveRoom).toHaveBeenCalledWith({
      context: undefined,
      room: expect.objectContaining({
        title: "Green Room",
        creator: "userId",
        type: "jukebox",
      }),
    })
  })
})
