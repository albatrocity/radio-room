import { ChatMessage } from "./ChatMessage";
import { User } from "./User";
import { Track } from "./Track";
import { Reaction, ReactionPayload } from "./Reaction";
import { PlaylistTrack } from "./PlaylistTrack";
import { WithTimestamp } from "./Utility";

export type TriggerSourceEvent<T> = {
  data: T;
  type: TriggerEventString;
};

export type CompareTo = {
  listeners?: User[];
  users?: User[];
  messages?: ChatMessage[];
  tracks?: Track[];
  reactions?: Reaction[];
};

export type ResourceIdentifier = string | `latest`;
export type TriggerActionType =
  | `skipTrack`
  | `likeTrack`
  | `sendMessage`
  | `pause`
  | `resume`;

export type TriggerEvent<T> = {
  action: TriggerActionType;
  conditions?: TriggerConditions<T>;
  on: TriggerEventString;
  subject: TriggerSubject;
  target?: TriggerTarget;
  meta?: {
    messageTemplate?: string;
  };
};

export type ReactionTriggerEvent = TriggerEvent<Reaction>;
export type MessageTriggerEvent = TriggerEvent<ChatMessage>;

export interface TriggerTarget {
  type: TriggerSubjectType;
  id?: ResourceIdentifier;
}

export type TriggerSubjectType = `track` | `message`;
export type TriggerEventString = `reaction` | `message`;
export type TriggerEventType = ReactionPayload | ChatMessage;

export interface TriggerSubject {
  type: TriggerSubjectType;
  id: ResourceIdentifier;
}

export interface TriggerQualifier<T> {
  sourceAttribute: keyof T;
  comparator: "includes" | "equals";
  determiner: any;
}

export type TriggerConditions<T> = {
  compareTo?: keyof CompareTo;
  comparator: `<` | `<=` | `=` | `>` | `>=`;
  threshold: number;
  thresholdType: `percent` | `count`;
  qualifier: TriggerQualifier<T>;
  maxTimes?: number;
};

export type TriggerMeta<T> = {
  sourcesOnSubject: T[];
  compareTo?: CompareTo;
  target?: PlaylistTrack | ChatMessage;
  messageTemplate?: string;
};

export type WithTriggerMeta<T, Source> = T & {
  meta: TriggerMeta<Source>;
};

export type TriggerEventHistory = WithTimestamp<TriggerEvent<any>>[];
