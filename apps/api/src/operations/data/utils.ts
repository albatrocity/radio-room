import { objectKeys } from "../../lib/tsExtras";
import { isNil } from "remeda";

import { pubClient } from "../../lib/redisClients";
import { Reaction } from "../../types/Reaction";
import { Room, StoredRoomMeta } from "../../types/Room";
import { StoredUser, User } from "../../types/User";
import { ChatMessage } from "../../types/ChatMessage";
import { compact } from "remeda";

type HSetOptions = {
  PX?: number;
};

export async function writeJsonToHset(
  setKey: string,
  attributes: Partial<User | Room | ChatMessage | Reaction | StoredRoomMeta>,
  options: HSetOptions = {}
) {
  const writes = objectKeys(attributes).map((key) => {
    if (!isNil(attributes[key])) {
      return pubClient.hSet(setKey, key, String(attributes[key]));
    }
  });
  if (options.PX) {
    pubClient.pExpire(setKey, options.PX);
  }
  return Promise.all(writes);
}

type HSet = {
  [x: string]: string;
};

export function hSetToObject(hset: HSet) {
  objectKeys(hset).reduce((acc, key) => {
    hset[key] = JSON.parse(hset[key]);
    return acc;
  }, hset);
  return hset;
}

// Gets keys from Redis that are indexed in a set
export async function getMembersFromSet<T>(
  setKey: string,
  recordPrefix: string,
  recordSuffix?: string
) {
  const members = await pubClient.sMembers(setKey);

  const reads = members.map(async (key) => {
    const memberKey = `${recordPrefix}:${key}${
      recordSuffix ? `:${recordSuffix}` : ""
    }`;

    const member = await pubClient.get(memberKey);
    if (!member) {
      return null;
    }
    return JSON.parse(member) as T;
  });
  const results = await Promise.all(reads);
  return compact(results);
}

// Gets keys from Redis that are indexed in a set
export async function getHMembersFromSet<T>(
  setKey: string,
  recordPrefix: string,
  recordSuffix?: string
) {
  const members = await pubClient.sMembers(setKey);

  const reads = members.map(async (key) => {
    const memberKey = `${recordPrefix}:${key}${
      recordSuffix ? `:${recordSuffix}` : ""
    }`;

    const member = await pubClient.hGetAll(memberKey);
    const memberExists = await pubClient.exists(memberKey);

    if (!member || memberExists === 0) {
      await pubClient.sRem(setKey, memberKey);
      return null;
    }
    return member as T;
  });
  const results = await Promise.all(reads);
  return compact(results);
}

// Deletes keys from Redis that are indexed in a set elsewhere
export async function deleteMembersFromSet(
  setKey: string,
  recordPrefix: string
) {
  const members = await pubClient.sMembers(setKey);
  const dels = members.map(async (key) => {
    return pubClient.unlink(`${recordPrefix}:${key}`);
  });
  await dels;
  return null;
}

export function mapUserBooleans(user: StoredUser) {
  return {
    ...user,
    isDj: user.isDj === "true",
    isDeputyDj: user.isDeputyDj === "true",
    isAdmin: user.isAdmin === "true",
  };
}

export function getTtl(key: string) {
  return pubClient.ttl(key);
}
