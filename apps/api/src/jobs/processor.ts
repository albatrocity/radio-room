import jukebox from "./jukebox";
import rooms from "./rooms";
import { pubClient, subClient } from "../lib/redisClients";
import {
  FIVE_MINUTES,
  JUKEBOX_FETCH_INTERVAL,
  PUBSUB_SPOTIFY_RATE_LIMIT_ERROR,
  RADIO_FETCH_INTERVAL,
  THREE_MINUTES,
  THROTTLED_JUKEBOX_FETCH_INTERVAL,
} from "../lib/constants";
import radio from "./radio";

let wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createLimitedTimeout = async (
  interval: number,
  callback: Awaited<() => void>
) => {
  // returns a delayed function that will get the spotifyFetchInterval from redis, execute the callback, and then call itself again with the new wait interval
  await wait(interval);
  const adjustedInterval = await pubClient.get("spotifyFetchInterval");
  const intervalValue = adjustedInterval
    ? parseInt(adjustedInterval)
    : JUKEBOX_FETCH_INTERVAL;
  callback();
  createLimitedTimeout(intervalValue, callback);
};

function setup() {
  pubClient.connect();
  subClient.connect();

  try {
    jukebox();
    rooms();
  } catch (e) {
    console.log("error from initial jobs");
    console.error(e);
  }

  createLimitedTimeout(JUKEBOX_FETCH_INTERVAL, () => {
    console.log("jukebox jobs");
    try {
      jukebox();
    } catch (e) {
      console.log("error from jukebox jobs");
      console.error(e);
    }
  });

  createLimitedTimeout(RADIO_FETCH_INTERVAL, () => {
    console.log("radio jobs");
    try {
      radio();
    } catch (e) {
      console.log("error from radio jobs");
      console.error(e);
    }
  });

  setInterval(() => {
    console.log("room jobs");
    rooms();
  }, FIVE_MINUTES);

  // listen for spotify rate limit errors
  subClient.pSubscribe(PUBSUB_SPOTIFY_RATE_LIMIT_ERROR, () => {
    // Increase the jukebox fetch interval to 10 seconds for three minutes
    pubClient.set("spotifyFetchInterval", THROTTLED_JUKEBOX_FETCH_INTERVAL, {
      PX: THREE_MINUTES,
    });
  });
}

setup();
