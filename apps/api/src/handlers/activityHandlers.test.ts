import { describe, test } from "@jest/globals";
import { makeSocket } from "../lib/testHelpers";
import {
  startListening,
  stopListening,
  addReaction,
  removeReaction,
} from "./activityHandlers";
import {
  updateUserAttributes,
  addReaction as addReactionData,
  removeReaction as removeReactionData,
  getAllRoomReactions,
} from "../operations/data";
import { pubUserJoined } from "../operations/sockets/users";

jest.mock("../lib/sendMessage");
jest.mock("../operations/data");
jest.mock("../operations/performTriggerAction");
jest.mock("../operations/sockets/users");

afterEach(() => {
  jest.clearAllMocks();
});

function setupTest({ updatedStatus = "listening" } = {}) {
  (updateUserAttributes as jest.Mock).mockResolvedValueOnce({
    user: {
      status: updatedStatus,
      userId: "1",
      username: "Homer",
    },
    users: [
      {
        status: updatedStatus,
        userId: "1",
        username: "Homer",
      },
    ],
  });
}

function setupReactionTest({} = {}) {
  (addReactionData as jest.Mock).mockResolvedValueOnce(null);

  (getAllRoomReactions as jest.Mock).mockResolvedValueOnce({
    message: {},
    track: {},
  });
}

describe("activityHandlers", () => {
  const { socket, io, broadcastEmit, emit, toEmit } = makeSocket({
    roomId: "activityRoom",
  });

  describe("startListening", () => {
    test("calls pubUserJoined", async () => {
      setupTest();
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await startListening({ socket, io });
      expect(pubUserJoined).toHaveBeenCalledWith({ io }, "activityRoom", {
        user: {
          status: "listening",
          userId: "1",
          username: "Homer",
        },
        users: [
          {
            status: "listening",
            userId: "1",
            username: "Homer",
          },
        ],
      });
    });
    test("calls updateUserAttributes", async () => {
      setupTest();
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await startListening({ socket, io });
      expect(updateUserAttributes).toHaveBeenCalledWith(
        "1",
        {
          status: "listening",
        },
        "activityRoom"
      );
    });
  });

  describe("stopListening", () => {
    test("calls pubUserJoined", async () => {
      setupTest({ updatedStatus: "participating" });
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await stopListening({ socket, io });
      expect(pubUserJoined).toHaveBeenCalledWith({ io }, "activityRoom", {
        user: {
          status: "participating",
          userId: "1",
          username: "Homer",
        },
        users: [
          {
            status: "participating",
            userId: "1",
            username: "Homer",
          },
        ],
      });
    });

    test("calls updateUserAttributes", async () => {
      setupTest({ updatedStatus: "participating" });
      socket.data.userId = "1";
      socket.data.username = "Homer";

      await stopListening({ socket, io });
      expect(updateUserAttributes).toHaveBeenCalledWith(
        "1",
        {
          status: "participating",
        },
        "activityRoom"
      );
    });
  });

  describe("addReaction", () => {
    it("calls addReaction data operation for messages", async () => {
      setupReactionTest();

      await addReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "message",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        }
      );

      expect(addReactionData).toHaveBeenCalledWith(
        "activityRoom",
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "message",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
        {
          id: "2",
          type: "message",
        }
      );
    });

    it("calls addReaction data operation for tracks", async () => {
      setupReactionTest();

      await addReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        }
      );

      expect(addReactionData).toHaveBeenCalledWith(
        "activityRoom",
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        },
        {
          id: "2",
          type: "track",
        }
      );
    });

    it("emits a REACTIONS event", async () => {
      setupReactionTest();
      await addReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        }
      );
      // actual reaction payloads are fetched before emitting, and
      // not stubbed here
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "REACTIONS",
        data: {
          reactions: {
            message: {},
            track: {},
          },
        },
      });
    });
  });

  describe("removeReaction", () => {
    it("calls removeReaction data operation for messages", async () => {
      setupReactionTest();

      await removeReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "message",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        }
      );
      expect(removeReactionData).toHaveBeenCalledWith(
        "activityRoom",
        {
          emoji: {
            id: "thumbs up",
            keywords: [],
            name: "thumbs up",
            shortcodes: ":+1:",
          },
          reactTo: { id: "2", type: "message" },
          user: { userId: "1", username: "Homer" },
        },
        { id: "2", type: "message" }
      );
    });

    it("calls removeReaction data operation for tracks", async () => {
      setupReactionTest();

      await removeReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        }
      );
      expect(removeReactionData).toHaveBeenCalledWith(
        "activityRoom",
        {
          emoji: {
            id: "thumbs up",
            keywords: [],
            name: "thumbs up",
            shortcodes: ":+1:",
          },
          reactTo: { id: "2", type: "track" },
          user: { userId: "1", username: "Homer" },
        },
        { id: "2", type: "track" }
      );
    });

    it("emits a REACTIONS event", async () => {
      setupReactionTest();

      await removeReaction(
        { socket, io },
        {
          emoji: {
            id: "thumbs up",
            name: "thumbs up",
            keywords: [],
            shortcodes: ":+1:",
          },
          reactTo: {
            type: "track",
            id: "2",
          },
          user: {
            userId: "1",
            username: "Homer",
          },
        }
      );
      // actual reaction payloads are fetched before emitting, and
      // not stubbed here
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "REACTIONS",
        data: {
          reactions: {
            message: {},
            track: {},
          },
        },
      });
    });
  });
});
