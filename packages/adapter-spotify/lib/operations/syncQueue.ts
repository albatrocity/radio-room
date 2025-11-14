import { getSpotifyApiForRoom } from "./getSpotifyApi";
import axios from "axios";
import { SpotifyTrack } from "../../types/SpotifyTrack";
import { setQueue, getQueue } from "../data";
import { compact } from "remeda";

const ENDPOINT = "https://api.spotify.com/v1/me/player/queue";

type QueueResponse = {
  currently_playing?: SpotifyTrack;
  queue: SpotifyTrack[];
};

export default async function syncQueue(roomId: string) {
  try {
    const spotifyApi = await getSpotifyApiForRoom(roomId);
    const accessToken = spotifyApi.getAccessToken();
    const { data }: { data: QueueResponse } = await axios.get(ENDPOINT, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const queuedUris = data.queue.map(({ uri }) => uri);
    const currentQueue = (await getQueue(roomId)) ?? [];
    const newQueue = compact(currentQueue).filter((t) => {
      return queuedUris.includes(t.uri);
    });
    await setQueue(roomId, newQueue);

    return getQueue(roomId);
  } catch (e) {
    return (await getQueue(roomId)) ?? [];
  }
}
