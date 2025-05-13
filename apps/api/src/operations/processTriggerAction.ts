import performTriggerAction from "./performTriggerAction";
import {
  TriggerEvent,
  TriggerSourceEvent,
  TriggerConditions,
  WithTriggerMeta,
  TriggerTarget,
  TriggerQualifier,
  ReactionTriggerEvent,
  MessageTriggerEvent,
  TriggerMeta,
} from "../types/Triggers";
import { Reaction, ReactionPayload } from "../types/Reaction";
import { Server } from "socket.io";
import { ChatMessage } from "../types/ChatMessage";
import { PlaylistTrack } from "../types/PlaylistTrack";
import { Room } from "../types/Room";
import {
  getMessages,
  getReactionsForSubject,
  getRoomPlaylist,
  getRoomUsers,
} from "./data";

function getThresholdValue<T>(count: number, conditions: TriggerConditions<T>) {
  if (conditions.thresholdType === "count") {
    return conditions.threshold;
  }

  return count * (conditions.threshold / 100);
}

async function getCompareTo(roomId: Room["id"], target?: TriggerTarget) {
  // const messages = await getMessages(roomId, 0, 200);
  // const users = await getRoomUsers(roomId);
  // return {
  //   listeners: getters
  //     .getUsers()
  //     .filter(({ status }) => status === "listening"),
  //   users: users,
  //   messages,
  //   reactions:
  //     target && target.id
  //       ? getters.getReactions()[target.type][target.id] || []
  //       : [],
  // };
}

function meetsThreshold<Incoming, Source>(
  count: number,
  trigger: TriggerEvent<Source>,
  data: WithTriggerMeta<Incoming, Source>
) {
  const { conditions } = trigger;
  if (!conditions) {
    return true;
  }
  // const instances = getters.getTriggerEventHistory().filter((event) => {
  //   const matchOn = event.on === trigger.on;
  //   const matchConditions = event.conditions === trigger.conditions;
  //   const matchSubject = event.subject === trigger.subject;
  //   const matchTargetId = event.target?.id === trigger.target?.id;
  //   const matchTargetType = event.target?.type === trigger.target?.type;
  //   const matchAction = event.action === trigger.action;
  //   return (
  //     matchOn &&
  //     matchConditions &&
  //     matchSubject &&
  //     matchTargetId &&
  //     matchTargetType &&
  //     matchAction
  //   );
  // });

  // if (conditions.maxTimes && instances.length >= conditions.maxTimes) {
  //   return false;
  // }

  // const compareTo = conditions.compareTo
  //   ? data.meta.compareTo?.[conditions.compareTo] || data.meta.sourcesOnSubject
  //   : data.meta.sourcesOnSubject;

  // const threshValue = getThresholdValue<Source>(compareTo.length, conditions);

  // switch (conditions.comparator) {
  //   case "<":
  //     return count < threshValue;
  //   case "<=":
  //     return count <= threshValue;
  //   case "=":
  //     return count == threshValue;
  //   case ">":
  //     return count > threshValue;
  //   case ">=":
  //     return count >= threshValue;
  // }
}

export function processTrigger<Incoming, Source>(
  data: WithTriggerMeta<Incoming, Source>,
  trigger: TriggerEvent<Source>,
  io: Server
) {
  // const eligible = data.meta.sourcesOnSubject.filter((x) => {
  //   if (trigger.conditions) {
  //     return makeQualifierFn<Source>(trigger.conditions.qualifier, x);
  //   } else {
  //     return true;
  //   }
  // });
  // if (meetsThreshold<Incoming, Source>(eligible.length, trigger, data)) {
  //   performTriggerAction<Incoming, Source>(data, trigger, io);
  // }
}

export function processReactionTriggers(
  data: ReactionPayload,
  roomId: Room["id"],
  triggers: ReactionTriggerEvent[],
  io: Server
) {
  // triggers.map(async (t) => {
  //   const currentReactions = await getReactionsForSubject(roomId, data.reactTo);
  //   const target = await getActionTarget(roomId, t.target);
  //   const trigger = await captureTriggerTarget<Reaction>(roomId, t);
  //   const meta: TriggerMeta<Reaction> = {
  //     sourcesOnSubject: currentReactions,
  //     compareTo: await getCompareTo(roomId, t.target),
  //     target,
  //     ...trigger.meta,
  //   };
  //   return processTrigger<ReactionPayload, Reaction>(
  //     {
  //       ...data,
  //       meta,
  //     },
  //     trigger,
  //     io
  //   );
  // });
}

export async function processMessageTriggers(
  data: ChatMessage,
  roomId: Room["id"],
  triggers: MessageTriggerEvent[],
  io: Server
) {
  const currentMessages = await getMessages(roomId, 0, 200);
  // triggers.map(async (t) => {
  //   const target = await getActionTarget(roomId, t.target);
  //   const trigger = await captureTriggerTarget(roomId, t);
  //   return processTrigger<ChatMessage, ChatMessage>(
  //     {
  //       ...data,
  //       meta: {
  //         sourcesOnSubject: currentMessages,
  //         compareTo: await getCompareTo(roomId, t.target),
  //         target,
  //         ...trigger.meta,
  //       },
  //     },
  //     trigger,
  //     io
  //   );
  // });
}

/**
 * Finds and executes all relevant triggers for the source event
 */
export function processTriggerAction<T extends ReactionPayload | ChatMessage>(
  { type, data }: TriggerSourceEvent<T>,
  roomId: Room["id"],
  io: Server
) {
  // switch (type) {
  //   case "reaction":
  //     return processReactionTriggers(
  //       data as ReactionPayload,
  //       roomId,
  //       getters.getReactionTriggerEvents(),
  //       io
  //     );
  //   case "message":
  //     return processMessageTriggers(
  //       data as ChatMessage,
  //       roomId,
  //       getters.getMessageTriggerEvents(),
  //       io
  //     );
  // }
}

/**
 * Finds and returns the full Target of the Trigger
 */
function getActionTarget(roomId: Room["id"], target?: TriggerTarget) {
  if (!target) {
    return undefined;
  }

  return getTarget(target, roomId);
}

async function getTarget(target: TriggerTarget, roomId: Room["id"]) {
  switch (target.type) {
    case "message":
      const messages = await getMessages(roomId, 0, 200);
      if (target.id === "latest") {
        return messages[0];
      }
      return messages.find((t) => t.timestamp === target.id);
    case "track":
      const playlist = await getRoomPlaylist(roomId);
      if (target.id === "latest") {
        return playlist[playlist.length - 1];
      }
      return playlist.find((t) => t.spotifyData?.uri === target.id);
    default:
      return undefined;
  }
}

/**
 * Returns Trigger with identified Target if using the 'latest' id alias
 */
async function captureTriggerTarget<T>(
  roomId: Room["id"],
  trigger: TriggerEvent<T>
) {
  if (trigger.target?.id === "latest") {
    const target = await getActionTarget(roomId, trigger.target);
    return {
      ...trigger,
      target: {
        type: trigger.target.type,
        id: getTriggerTargetId(trigger.target, target),
      },
    };
  }
  return trigger;
}

function getTriggerTargetId(
  target: TriggerTarget,
  foundTarget?: PlaylistTrack | ChatMessage
) {
  switch (target.type) {
    case "track":
      return (foundTarget as PlaylistTrack)?.spotifyData?.uri;
    case "message":
      return (foundTarget as ChatMessage)?.timestamp;
    default:
      return undefined;
  }
}

function makeQualifierFn<Source>(
  qualifier: TriggerQualifier<Source>,
  data: Source
) {
  const source = data[qualifier.sourceAttribute];
  switch (qualifier.comparator) {
    case "equals":
      return source == qualifier.determiner;
    case "includes":
      return (source as string).includes(qualifier.determiner);
  }
}
