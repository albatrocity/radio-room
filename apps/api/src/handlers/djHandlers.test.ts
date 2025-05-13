import { describe, test } from "@jest/globals";
import { makeSocket } from "../lib/testHelpers";
import {
  djDeputizeUser,
  queueSong,
  searchSpotifyTrack,
  savePlaylist,
} from "./djHandlers";
import {
  addToQueue,
  getQueue,
  getUser,
  isDj,
  updateUserAttributes,
} from "../operations/data";
import sendMessage from "../lib/sendMessage";
import refreshSpotifyToken from "../operations/spotify/refreshSpotifyToken";
import createAndPopulateSpotifyPlaylist from "../operations/spotify/createAndPopulateSpotifyPlaylist";
import { pubUserJoined } from "../operations/sockets/users";

const spotifyAddToQueue = jest.fn();
const searchTracks = jest.fn(() => ({
  data: {
    body: {
      tracks: [],
    },
  },
}));
const setRefreshToken = jest.fn();

jest.mock("../lib/sendMessage");
jest.mock("../operations/spotify/refreshSpotifyToken");
jest.mock("../operations/spotify/syncQueue");
jest.mock("../operations/spotify/createAndPopulateSpotifyPlaylist");
jest.mock("../operations/data");
jest.mock("../operations/sockets/users");
jest.mock("../operations/spotify/getSpotifyApi", () => ({
  getSpotifyApiForRoom: jest.fn(async () => ({
    addToQueue: spotifyAddToQueue,
    searchTracks,
    setRefreshToken,
  })),
}));

afterEach(() => {
  jest.clearAllMocks();
  // resetDataStores();
});

function setupDjTest({ isAlreadyDj = false }: { isAlreadyDj?: boolean } = {}) {
  const user = {
    id: "socketId",
    userId: "1",
    username: "Homer",
    isDeputyDj: isAlreadyDj,
  };
  (getUser as jest.Mock).mockResolvedValueOnce(user);
  (isDj as jest.Mock).mockResolvedValueOnce(isAlreadyDj);

  (updateUserAttributes as jest.Mock).mockResolvedValueOnce({
    user: {
      ...user,
      isDeputyDj: !isAlreadyDj,
    },
    users: [{ ...user, isDeputyDj: !isAlreadyDj }],
  });

  return {
    user: { ...user, isDeputyDj: !isAlreadyDj },
    users: [{ ...user, isDeputyDj: !isAlreadyDj }],
  };
}

function setupQueueTest() {
  const user = {
    id: "socketId",
    userId: "1",
    username: "Homer",
  };
  (getUser as jest.Mock).mockResolvedValue(user);
  (getQueue as jest.Mock).mockResolvedValueOnce([
    {
      uri: "uri",
      userId: "1",
      username: "Homer",
    },
  ]);
  return { user };
}

describe("djHandlers", () => {
  const { socket, io, broadcastEmit, emit, toEmit, to } = makeSocket({
    roomId: "djRoom",
  });

  describe("djDeputizeUser", () => {
    test("marks as deputy DJ if not already", async () => {
      const { user } = setupDjTest();

      await djDeputizeUser({ io, socket }, user.userId);
      expect(updateUserAttributes).toHaveBeenCalledWith(
        "1",
        {
          isDeputyDj: true,
        },
        "djRoom"
      );
    });

    test("unmarks user as deputy dj if already deputy dj", async () => {
      setupDjTest({ isAlreadyDj: true });

      await djDeputizeUser({ io, socket }, "1");
      expect(updateUserAttributes).toHaveBeenCalledWith(
        "1",
        {
          isDeputyDj: false,
        },
        "djRoom"
      );
    });

    test("emits NEW_MESSAGE event to user", async () => {
      const { user } = setupDjTest();

      await djDeputizeUser({ io, socket }, user.userId);

      expect(toEmit).toHaveBeenCalledWith(
        "event",
        {
          type: "NEW_MESSAGE",
          data: {
            content:
              "You've been promoted to a deputy DJ. You may now add songs to the DJ's queue.",
            meta: {
              status: "info",
              type: "alert",
            },
            user: {
              id: "system",
              userId: "system",
              username: "system",
            },
            timestamp: expect.any(String),
          },
        },
        { status: "info" }
      );
    });

    test("emits START_DEPUTY_DJ_SESSION event to user", async () => {
      const { user } = setupDjTest();

      await djDeputizeUser({ io, socket }, user.userId);
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "START_DEPUTY_DJ_SESSION",
      });
    });

    test("emits END_DEPUTY_DJ_SESSION event to user if ending", async () => {
      const { user } = setupDjTest({ isAlreadyDj: true });
      await djDeputizeUser({ io, socket }, user.userId);
      expect(toEmit).toHaveBeenCalledWith("event", {
        type: "END_DEPUTY_DJ_SESSION",
      });
      expect(to).toHaveBeenCalledWith(user.id);
    });

    test("calls pubSubUserJoined", async () => {
      const { user, users } = setupDjTest();
      await djDeputizeUser({ io, socket }, user.userId);
      expect(pubUserJoined).toHaveBeenCalledWith({ io }, "djRoom", {
        user,
        users,
      });
    });
  });

  describe("queueSong", () => {
    test("emits SONG_QUEUE_FAILURE event if current user already added it", async () => {
      const { user } = setupQueueTest();
      socket.data.userId = user.userId;

      await queueSong({ socket, io }, "uri");

      expect(emit).toHaveBeenCalledWith("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          message: "You've already queued that song, please choose another",
        },
      });
    });

    test("emits SONG_QUEUE_FAILURE event if other user already queued song", async () => {
      socket.data.userId = "2";
      setupQueueTest();

      await queueSong({ socket, io }, "uri");

      expect(emit).toHaveBeenCalledWith("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          message:
            "Homer has already queued that song. Please try a different song.",
        },
      });
    });

    test("calls addToQueue on Spotify API", async () => {
      const { user } = setupQueueTest();
      socket.data.userId = user.userId;
      await queueSong({ socket, io }, "other_uri");
      expect(spotifyAddToQueue).toHaveBeenCalledWith("other_uri");
    });

    test("adds queued track to redis", async () => {
      const { user } = setupQueueTest();
      socket.data.userId = user.userId;

      (spotifyAddToQueue as jest.Mock).mockResolvedValueOnce({
        uri: "other_uri",
      });
      await queueSong({ socket, io }, "other_uri");
      expect(addToQueue).toHaveBeenCalledWith("djRoom", {
        uri: "other_uri",
        userId: "1",
        username: "Homer",
      });
    });

    test("emits SONG_QUEUED event", async () => {
      const { user } = setupQueueTest();
      socket.data.userId = user.userId;

      (spotifyAddToQueue as jest.Mock).mockResolvedValueOnce({
        uri: "other_uri",
      });

      await queueSong({ socket, io }, "other_uri");

      expect(emit).toHaveBeenCalledWith("event", {
        type: "SONG_QUEUED",
        data: {
          uri: "other_uri",
        },
      });
    });

    test("emits SONG_QUEUE_FAILURE event on error", async () => {
      const { user } = setupQueueTest();
      socket.data.userId = user.userId;
      (spotifyAddToQueue as jest.Mock).mockRejectedValueOnce({
        uri: "other_uri",
      });

      await queueSong({ socket, io }, "other_uri");

      expect(emit).toHaveBeenCalledWith("event", {
        type: "SONG_QUEUE_FAILURE",
        data: {
          error: { uri: "other_uri" },
          message: "Song could not be queued",
        },
      });
    });

    test("calls sendMessage", async () => {
      const { user } = setupQueueTest();
      socket.data.userId = user.userId;

      (spotifyAddToQueue as jest.Mock).mockResolvedValueOnce({
        uri: "other_uri",
      });

      await queueSong({ socket, io }, "other_uri");

      expect(sendMessage).toHaveBeenCalledWith(io, "djRoom", {
        content: "Homer added a song to the queue",
        timestamp: expect.any(String),
        user: {
          id: "system",
          userId: "system",
          username: "system",
          mentions: undefined,
          meta: undefined,
        },
      });
    });
  });

  describe("searchSpotifyTrack", () => {
    test("calls searchTracks", async () => {
      setupQueueTest();
      (searchTracks as jest.Mock).mockResolvedValueOnce({
        body: {
          tracks: [
            {
              name: "Cottoneye Joe",
              uri: "uri",
            },
          ],
        },
      });
      await searchSpotifyTrack(
        { socket, io },
        { query: "cottoneye joe", options: {} }
      );
      expect(searchTracks).toHaveBeenCalledWith("cottoneye joe", {});
    });

    test("emits TRACK_SEARCH_RESULTS event", async () => {
      setupQueueTest();
      (searchTracks as jest.Mock).mockResolvedValueOnce({
        body: {
          tracks: [
            {
              name: "Cottoneye Joe",
              uri: "uri",
            },
          ],
        },
      });
      await searchSpotifyTrack(
        { socket, io },
        { query: "cottoneye joe", options: {} }
      );
      expect(emit).toHaveBeenCalledWith("event", {
        type: "TRACK_SEARCH_RESULTS",
        data: [
          {
            name: "Cottoneye Joe",
            uri: "uri",
          },
        ],
      });
    });

    test("emits TRACK_SEARCH_RESULTS_FAILURE event on error", async () => {
      setupQueueTest();
      (searchTracks as jest.Mock).mockRejectedValueOnce({});
      await searchSpotifyTrack(
        { socket, io },
        { query: "cottoneye joe", options: {} }
      );
      expect(emit).toHaveBeenCalledWith("event", {
        type: "TRACK_SEARCH_RESULTS_FAILURE",
        data: {
          error: {},
          message:
            "Something went wrong when trying to search for tracks. You might need to log in to Spotify's OAuth",
        },
      });
    });

    test("refreshes token on error", async () => {
      setupQueueTest();
      (searchTracks as jest.Mock).mockRejectedValueOnce({});
      await searchSpotifyTrack(
        { socket, io },
        { query: "cottoneye joe", options: {} }
      );
      expect(refreshSpotifyToken).toHaveBeenCalled();
    });
  });

  describe("savePlaylist", () => {
    it("calls createAndPopulateSpotifyPlaylist", async () => {
      setupQueueTest();
      socket.data.userId = "1";
      await savePlaylist(
        { socket, io },
        { name: "Hot Jams", uris: ["track1", "track2", "track3"] }
      );
      expect(createAndPopulateSpotifyPlaylist).toHaveBeenCalledWith(
        "Hot Jams",
        ["track1", "track2", "track3"],
        "1"
      );
    });

    it("emits PLAYLIST_SAVED event on success", async () => {
      setupQueueTest();
      socket.data.userId = "1";

      (createAndPopulateSpotifyPlaylist as jest.Mock).mockResolvedValueOnce({
        info: "Stuff from Spotify",
      });
      await savePlaylist(
        { socket, io },
        { name: "Hot Jams", uris: ["track1", "track2", "track3"] }
      );
      expect(emit).toHaveBeenCalledWith("event", {
        type: "PLAYLIST_SAVED",
        data: {
          info: "Stuff from Spotify",
        },
      });
    });

    it("emits SAVE_PLAYLIST_FAILED event on error", async () => {
      setupQueueTest();
      (createAndPopulateSpotifyPlaylist as jest.Mock).mockRejectedValueOnce({
        error: "Boo",
      });
      await savePlaylist(
        { socket, io },
        { name: "Hot Jams", uris: ["track1", "track2", "track3"] }
      );
      expect(emit).toHaveBeenCalledWith("event", {
        type: "SAVE_PLAYLIST_FAILED",
        error: {
          error: "Boo",
        },
      });
    });
  });
});
