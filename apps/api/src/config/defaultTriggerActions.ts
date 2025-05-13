import { ReactionTriggerEvent } from "../types/Triggers";

const skipUnlikedTracks: ReactionTriggerEvent = {
  action: "skipTrack",
  on: "reaction",
  subject: {
    type: "track",
    id: "latest",
  },
  target: {
    type: "track",
    id: "latest",
  },
  conditions: {
    comparator: ">",
    threshold: 50,
    thresholdType: "percent",
    qualifier: {
      sourceAttribute: "emoji",
      comparator: "equals",
      determiner: ":-1:",
    },
    compareTo: "listeners",
    maxTimes: 1,
  },
  meta: {
    messageTemplate: "_{{ target.track }}_ was democratically skipped",
  },
};

const likeTrack: ReactionTriggerEvent = {
  action: "likeTrack",
  on: "reaction",
  subject: {
    type: "track",
    id: "latest",
  },
  target: {
    type: "track",
    id: "latest",
  },
  conditions: {
    comparator: ">",
    threshold: 50,
    thresholdType: "percent",
    qualifier: {
      sourceAttribute: "emoji",
      comparator: "equals",
      determiner: ":+1:",
    },
    compareTo: "listeners",
    maxTimes: 1,
  },
};

export const defaultReactionTriggerEvents = [skipUnlikedTracks, likeTrack];
export const defaultMessageTriggerEvents = [];
