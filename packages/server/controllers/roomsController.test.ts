import { create } from "../controllers/roomsController";
import httpMocks from "node-mocks-http";
import { checkUserChallenge } from "../operations/userChallenge";
import { saveRoom } from "../operations/data";

jest.mock("../operations/userChallenge", () => ({
  checkUserChallenge: jest.fn(),
}));
jest.mock("../operations/createRoom", () => ({
  createRoomId: jest.fn(() => "roomId"),
  persistRoom: jest.fn(),
  withDefaults: jest.requireActual("../operations/createRoom").withDefaults,
}));
jest.mock("../operations/data");

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
    });

    const response = httpMocks.createResponse();

    await create(request, response);
    expect(checkUserChallenge).toHaveBeenCalledWith({
      challenge: "challenge",
      userId: "userId",
    });
  });

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
    });

    const response = httpMocks.createResponse();
    (checkUserChallenge as jest.Mock).mockRejectedValue("Unauthorized");

    await create(request, response);
    expect(response.statusCode).toBe(401);
  });

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
    });

    const response = httpMocks.createResponse();
    (checkUserChallenge as jest.Mock).mockResolvedValue(1);

    await create(request, response);
    expect(saveRoom).toHaveBeenCalledWith({
      artwork: undefined,
      createdAt: expect.any(String),
      lastRefreshedAt: expect.any(String),
      creator: "userId",
      deputizeOnJoin: false,
      enableSpotifyLogin: false,
      extraInfo: undefined,
      fetchMeta: true,
      id: "roomId",
      password: null,
      radioMetaUrl: undefined,
      radioProtocol: undefined,
      title: "Green Room",
      type: "jukebox",
      announceNowPlaying: true,
      announceUsernameChanges: true,
    });
  });
});
