/**
 * Room feedback topics + my responses + admin inbox (ADR 0145).
 */

import { assign, setup } from "xstate"
import type {
  FeedbackInboxEntry,
  FeedbackResponse,
  FeedbackTopic,
  FeedbackVote,
} from "@repo/types"
import { GENERAL_FEEDBACK_TOPIC_ID } from "@repo/types"
import { emitToSocket, subscribeById, unsubscribeById } from "../actors/socketActor"
import {
  raiseNotification,
  reconcileNotifications,
  resolveNotifications,
} from "../actors/notificationsActor"
import {
  feedbackInboxNotificationId,
  feedbackTopicNotificationId,
} from "../lib/feedbackNotificationIds"
import {
  getViewedFeedbackTopicIds,
  markFeedbackTopicsViewed,
} from "../lib/feedbackViewedPreference"
import { toast } from "../lib/toasts"

const FEEDBACK_TOPICS_SOURCE = "feedback-topics"
const FEEDBACK_INBOX_SOURCE = "feedback-inbox"

export interface FeedbackContext {
  topics: FeedbackTopic[]
  myResponses: Record<string, FeedbackResponse>
  inboxTopics: FeedbackTopic[]
  inbox: FeedbackInboxEntry[]
  subscriptionId: string | null
  roomId: string | null
  /** Set when a save fails so form rows can rollback. */
  lastFailedTopicId: string | null
  lastFailedAt: number
}

type FeedbackEvent =
  | { type: "ACTIVATE"; roomId?: string }
  | { type: "DEACTIVATE" }
  | {
      type: "INIT"
      data: {
        feedbackTopics?: FeedbackTopic[]
        myFeedbackResponses?: Record<string, FeedbackResponse>
      }
    }
  | {
      type: "ROOM_DATA"
      data: {
        feedbackTopics?: FeedbackTopic[]
        myFeedbackResponses?: Record<string, FeedbackResponse>
      }
    }
  | { type: "FEEDBACK_TOPICS_CHANGED"; data: { topics: FeedbackTopic[] } }
  | { type: "FEEDBACK_RESPONSE_SAVED"; data: { response: FeedbackResponse } }
  | { type: "FEEDBACK_RESPONSE_FAILED"; data: { topicId: string; reason: string } }
  | {
      type: "FEEDBACK_INBOX"
      data: { topics: FeedbackTopic[]; responses: FeedbackInboxEntry[] }
    }
  | { type: "FEEDBACK_INBOX_UPDATED"; data: { entry: FeedbackInboxEntry } }
  | {
      type: "SAVE_RESPONSE"
      data: { topicId: string; vote?: FeedbackVote; comment?: string }
    }
  | { type: "SET_TOPICS"; data: { topics: { id?: string; title: string; description?: string }[] } }
  | { type: "FETCH_INBOX" }
  | { type: "MARK_SURFACE_VIEWED" }

let subscriptionCounter = 0

function syncTopicNotifications(roomId: string | null, topics: FeedbackTopic[]) {
  if (!roomId) return
  const viewed = getViewedFeedbackTopicIds(roomId)
  const keepIds: string[] = []
  for (const topic of topics) {
    if (topic.id === GENERAL_FEEDBACK_TOPIC_ID) continue
    const id = feedbackTopicNotificationId(topic.id)
    keepIds.push(id)
    if (!viewed.has(topic.id)) {
      raiseNotification({
        id,
        source: FEEDBACK_TOPICS_SOURCE,
        target: { surface: "feedback" },
        clearOn: "view",
        persist: true,
      })
    }
  }
  reconcileNotifications(FEEDBACK_TOPICS_SOURCE, keepIds)
}

export const feedbackMachine = setup({
  types: {
    context: {} as FeedbackContext,
    events: {} as FeedbackEvent,
  },
  actions: {
    subscribe: assign(({ self }) => {
      const id = `feedback-${self.id}-${++subscriptionCounter}`
      subscribeById(id, {
        send: (ev) => self.send(ev as FeedbackEvent),
        eventTypes: [
          "INIT",
          "ROOM_DATA",
          "FEEDBACK_TOPICS_CHANGED",
          "FEEDBACK_RESPONSE_SAVED",
          "FEEDBACK_RESPONSE_FAILED",
          "FEEDBACK_INBOX",
          "FEEDBACK_INBOX_UPDATED",
        ],
      })
      return { subscriptionId: id }
    }),
    setRoomId: assign(({ event }) => ({
      roomId: event.type === "ACTIVATE" ? (event.roomId ?? null) : null,
    })),
    unsubscribe: ({ context }) => {
      if (context.subscriptionId) {
        unsubscribeById(context.subscriptionId)
      }
    },
    hydrateFromInit: assign(({ context, event }) => {
      if (event.type !== "INIT") return {}
      const topics = event.data.feedbackTopics ?? []
      const myResponses = event.data.myFeedbackResponses ?? {}
      syncTopicNotifications(context.roomId, topics)
      return { topics, myResponses }
    }),
    applyRoomData: assign(({ context, event }) => {
      if (event.type !== "ROOM_DATA") return {}
      const topics = event.data.feedbackTopics ?? context.topics
      const myResponses = event.data.myFeedbackResponses ?? context.myResponses
      syncTopicNotifications(context.roomId, topics)
      return { topics, myResponses }
    }),
    setTopics: assign(({ context, event }) => {
      if (event.type !== "FEEDBACK_TOPICS_CHANGED") return {}
      syncTopicNotifications(context.roomId, event.data.topics)
      return { topics: event.data.topics }
    }),
    applySavedResponse: assign(({ context, event }) => {
      if (event.type !== "FEEDBACK_RESPONSE_SAVED") return {}
      const response = event.data.response
      return {
        myResponses: {
          ...context.myResponses,
          [response.topicId]: response,
        },
      }
    }),
    toastSaveFailed: assign(({ event }) => {
      if (event.type !== "FEEDBACK_RESPONSE_FAILED") return {}
      toast({
        title: "Could not save feedback",
        description: event.data.reason,
        type: "error",
      })
      return {
        lastFailedTopicId: event.data.topicId,
        lastFailedAt: Date.now(),
      }
    }),
    setInbox: assign(({ event }) => {
      if (event.type !== "FEEDBACK_INBOX") return {}
      return {
        inboxTopics: event.data.topics,
        inbox: event.data.responses,
      }
    }),
    mergeInboxEntry: assign(({ context, event }) => {
      if (event.type !== "FEEDBACK_INBOX_UPDATED") return {}
      const entry = event.data.entry
      const without = context.inbox.filter(
        (e) => !(e.topicId === entry.topicId && e.userId === entry.userId),
      )
      const notifId = feedbackInboxNotificationId(entry.topicId, entry.userId)
      const topicTitle =
        context.inboxTopics.find((t) => t.id === entry.topicId)?.title ??
        context.topics.find((t) => t.id === entry.topicId)?.title ??
        (entry.topicId === GENERAL_FEEDBACK_TOPIC_ID ? "General feedback" : "Feedback")
      raiseNotification({
        id: notifId,
        source: FEEDBACK_INBOX_SOURCE,
        target: { surface: "adminSettings", tabId: "feedback" },
        clearOn: "view",
        toast: {
          title: "New feedback",
          description: topicTitle,
          action: "open",
          duration: 8000,
        },
      })
      return {
        inbox: [entry, ...without].sort((a, b) => b.updatedAt - a.updatedAt),
      }
    }),
    emitSaveResponse: ({ event }) => {
      if (event.type !== "SAVE_RESPONSE") return
      emitToSocket("SAVE_FEEDBACK_RESPONSE", event.data)
    },
    emitSetTopics: ({ event }) => {
      if (event.type !== "SET_TOPICS") return
      emitToSocket("SET_FEEDBACK_TOPICS", { topics: event.data.topics })
    },
    emitFetchInbox: () => {
      emitToSocket("GET_FEEDBACK_INBOX", {})
    },
    markSurfaceViewed: ({ context }) => {
      const roomId = context.roomId
      if (!roomId) return
      const ids = context.topics.map((t) => t.id)
      markFeedbackTopicsViewed(roomId, ids)
      resolveNotifications(ids.map(feedbackTopicNotificationId))
    },
    reset: assign({
      topics: () => [],
      myResponses: () => ({}),
      inboxTopics: () => [],
      inbox: () => [],
      subscriptionId: () => null,
      roomId: () => null,
      lastFailedTopicId: () => null,
      lastFailedAt: () => 0,
    }),
  },
}).createMachine({
  id: "feedback",
  initial: "idle",
  context: {
    topics: [],
    myResponses: {},
    inboxTopics: [],
    inbox: [],
    subscriptionId: null,
    roomId: null,
    lastFailedTopicId: null,
    lastFailedAt: 0,
  },
  states: {
    idle: {
      on: {
        ACTIVATE: {
          target: "active",
          actions: ["setRoomId"],
        },
      },
    },
    active: {
      entry: ["subscribe"],
      exit: ["unsubscribe", "reset"],
      on: {
        DEACTIVATE: "idle",
        INIT: { actions: ["hydrateFromInit"] },
        ROOM_DATA: { actions: ["applyRoomData"] },
        FEEDBACK_TOPICS_CHANGED: { actions: ["setTopics"] },
        FEEDBACK_RESPONSE_SAVED: { actions: ["applySavedResponse"] },
        FEEDBACK_RESPONSE_FAILED: { actions: ["toastSaveFailed"] },
        FEEDBACK_INBOX: { actions: ["setInbox"] },
        FEEDBACK_INBOX_UPDATED: { actions: ["mergeInboxEntry"] },
        SAVE_RESPONSE: { actions: ["emitSaveResponse"] },
        SET_TOPICS: { actions: ["emitSetTopics"] },
        FETCH_INBOX: { actions: ["emitFetchInbox"] },
        MARK_SURFACE_VIEWED: { actions: ["markSurfaceViewed"] },
      },
    },
  },
})
