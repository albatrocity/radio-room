import { describe } from "@jest/globals";
import { makeSocket } from "../lib/testHelpers";
import { setPassword, kickUser, setRoomSettings } from "./adminHandlers";

import { findRoom, getUser, saveRoom } from "../operations/data";

jest.mock("../lib/sendMessage");
jest.mock("../lib/spotifyApi");
jest.mock("../operations/spotify/createAndPopulateSpotifyPlaylist");
jest.mock("../operations/getStation");
jest.mock("../operations/data");

afterEach(() => {
  jest.clearAllMocks();
});

describe("adminHandlers", () => {
  const { socket, io, emit, toEmit } = makeSocket();

  describe("changing artwork", () => {
    it("updates settings", async () => {
      (findRoom as jest.Mock).mockResolvedValueOnce({
        artwork: undefined,
      });
      await setRoomSettings(
        { socket, io },
        {
          artwork: "google.com",
          fetchMeta: true,
          extraInfo: undefined,
          password: null,
          deputizeOnJoin: false,
          enableSpotifyLogin: false,
        }
      );
      expect(saveRoom).toHaveBeenCalledWith({
        artwork: "google.com",
        extraInfo: undefined,
        fetchMeta: true,
        password: null,
        deputizeOnJoin: false,
        enableSpotifyLogin: false,
      });
    });
  });

  describe("setPassword", () => {
    it("sets password", async () => {
      (findRoom as jest.Mock).mockResolvedValueOnce({
        password: undefined,
      });
      await setPassword({ socket, io }, "donut");
      expect(saveRoom).toHaveBeenCalledWith({
        password: "donut",
      });
    });
  });

  describe("kickUser", () => {
    it("sends kicked event to kicked user", async () => {
      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
        id: "1234-5678",
      });

      await kickUser({ socket, io }, { userId: "1", username: "Homer" });
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "KICKED",
      });
    });
    it("sends system message to kicked user", async () => {
      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
        id: "1234-5678",
      });
      await kickUser(
        { socket, io },
        { userId: "1", username: "Homer", id: "1234-5678" }
      );
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "NEW_MESSAGE",
        data: {
          content: "You have been kicked. I hope you deserved it.",
          meta: { status: "error", title: "Kicked", type: "alert" },
          timestamp: expect.any(String),
          user: { id: "system", userId: "system", username: "system" },
        },
      });
    });
  });

  describe("setRoomSettings", () => {
    it("sets settings", async () => {
      (findRoom as jest.Mock).mockResolvedValueOnce({});
      const newSettings = {
        extraInfo: "Heyyyyyy",
        fetchMeta: false,
        password: null,
        deputizeOnJoin: false,
        enableSpotifyLogin: false,
      };
      await setRoomSettings({ socket, io }, newSettings);
      expect(saveRoom).toHaveBeenCalledWith(newSettings);
    });

    it("emits ROOM_SETTINGS event", async () => {
      const newSettings = {
        extraInfo: "Heyyyyyy",
        fetchMeta: false,
        password: null,
        deputizeOnJoin: false,
        enableSpotifyLogin: false,
      };
      (findRoom as jest.Mock)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(newSettings);
      (saveRoom as jest.Mock).mockResolvedValueOnce({});
      await setRoomSettings({ socket, io }, newSettings);
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "ROOM_SETTINGS",
        data: { room: newSettings },
      });
    });

    it("requires user to be room creator", async () => {
      (findRoom as jest.Mock).mockResolvedValueOnce({
        creator: "1",
      });
      socket.data.userId = "2";

      await setRoomSettings(
        { socket, io },
        {
          extraInfo: "Heyyyyyy",
          fetchMeta: false,
          password: null,
          deputizeOnJoin: false,
          enableSpotifyLogin: false,
        }
      );

      expect(emit).toHaveBeenCalledWith("event", {
        type: "ERROR",
        data: {
          status: 403,
          error: "Forbidden",
          message: "You are not the room creator.",
        },
      });
    });
  });
});
