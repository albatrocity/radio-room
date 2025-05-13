import { describe, test } from "@jest/globals";
import { makeSocket } from "../lib/testHelpers";
import {
  clearMessages,
  newMessage,
  startTyping,
  stopTyping,
} from "./messageHandlers";
import getMessageVariables from "../lib/getMessageVariables";
import sendMessage from "../lib/sendMessage";

import {
  clearMessages as clearMessagesData,
  getUser,
  getTypingUsers,
  removeTypingUser,
  addTypingUser,
} from "../operations/data";

jest.mock("../lib/getMessageVariables");
jest.mock("../lib/sendMessage");
jest.mock("../operations/data");
jest.mock("../operations/processTriggerAction");

beforeEach(() => {
  jest.clearAllMocks();
});

describe("messageHandlers", () => {
  const { socket, io, broadcastEmit, emit, toEmit, toBroadcast } = makeSocket({
    roomId: "room1",
  });
  describe("clearMessages", () => {
    test("clears messages", async () => {
      await clearMessages({ socket, io });
      expect(clearMessagesData).toHaveBeenCalledWith("room1");
    });

    test("emits SET_MESSAGES event", async () => {
      await clearMessages({ socket, io });
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "SET_MESSAGES",
        data: {
          messages: [],
        },
      });
    });
  });

  describe("newMessage", () => {
    test("sends message", async () => {
      socket.data.userId = "1";
      socket.data.username = "Homer";

      (getMessageVariables as jest.Mock).mockReturnValueOnce({
        currentTrack: undefined,
        nowPlaying: undefined,
        listenerCount: 1,
        participantCount: 2,
        userCount: 3,
        playlistCount: 4,
        queueCount: 5,
      });

      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });

      await newMessage({ socket, io }, "D'oh");

      expect(sendMessage).toHaveBeenCalledWith(io, "room1", {
        content: "D'oh",
        mentions: [],
        timestamp: expect.any(String),
        user: { userId: "1", username: "Homer" },
      });
    });

    test("removes message's user from typing list", async () => {
      socket.data.userId = "1";

      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });
      (removeTypingUser as jest.Mock).mockResolvedValueOnce(null);
      (getTypingUsers as jest.Mock).mockResolvedValueOnce([]);

      await newMessage({ socket, io }, "");

      expect(removeTypingUser).toHaveBeenCalledWith("room1", "1");
    });

    test("emits TYPING event to clear message user", async () => {
      socket.data.userId = "1";

      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });
      (removeTypingUser as jest.Mock).mockResolvedValueOnce(null);
      (getTypingUsers as jest.Mock).mockResolvedValueOnce([]);

      await newMessage({ socket, io }, "");

      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: {
          typing: [],
        },
      });
    });
  });

  describe("startTyping", () => {
    test("adds user to typing list", async () => {
      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });
      (getTypingUsers as jest.Mock).mockResolvedValueOnce([]);
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await startTyping({ socket, io });
      expect(addTypingUser).toHaveBeenCalledWith("room1", "1");
    });

    test("broadcasts TYPING event", async () => {
      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });
      (getTypingUsers as jest.Mock).mockResolvedValueOnce([
        {
          userId: "1",
          username: "Homer",
        },
      ]);
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await startTyping({ socket, io });

      expect(broadcastEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: {
          typing: [{ userId: "1", username: "Homer" }],
        },
      });
    });

    test("broadcasts to room channel", async () => {
      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });
      (getTypingUsers as jest.Mock).mockResolvedValueOnce([]);
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await startTyping({ socket, io });

      expect(toBroadcast).toHaveBeenCalledWith("/rooms/room1");
    });
  });

  describe("stopTyping", () => {
    test("removes user from typing user", async () => {
      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });
      (getTypingUsers as jest.Mock).mockResolvedValueOnce([
        {
          userId: "1",
          username: "Homer",
        },
      ]);
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await stopTyping({ socket, io });
      expect(removeTypingUser).toHaveBeenCalledWith("room1", "1");
    });

    test("broadcasts TYPING event", async () => {
      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });
      (getTypingUsers as jest.Mock).mockResolvedValueOnce([]);
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await stopTyping({ socket, io });

      expect(broadcastEmit).toHaveBeenCalledWith("event", {
        type: "TYPING",
        data: {
          typing: [],
        },
      });
    });

    test("broadcasts to room channel", async () => {
      (getUser as jest.Mock).mockResolvedValueOnce({
        userId: "1",
        username: "Homer",
      });
      (getTypingUsers as jest.Mock).mockResolvedValueOnce([]);
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await stopTyping({ socket, io });

      expect(toBroadcast).toHaveBeenCalledWith("/rooms/room1");
    });
  });
});
