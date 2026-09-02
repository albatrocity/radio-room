/**
 * Per-topic feedback response form (ADR 0145).
 * Vote saves immediately; comment uses XState `after` debounce (including empty).
 * Named topics require a vote before commenting; General may comment without a vote.
 */

import { assign, setup } from "xstate"
import type { FeedbackVote } from "@repo/types"

export type FeedbackResponseFormContext = {
  topicId: string
  vote: FeedbackVote | null
  comment: string
  savedVote: FeedbackVote | null
  savedComment: string
  savePending: boolean
  rollbackVote: FeedbackVote | null
  rollbackComment: string | null
  allowCommentWithoutVote: boolean
}

export type FeedbackResponseFormEvent =
  | { type: "HYDRATE"; vote: FeedbackVote | null; comment: string }
  | { type: "SET_VOTE"; vote: FeedbackVote }
  | { type: "SET_COMMENT"; comment: string }
  | { type: "FLUSH" }
  | { type: "SYNC_SAVED"; vote: FeedbackVote | null; comment: string }
  | { type: "SAVE_FAILED" }

export type FeedbackResponseFormInput = {
  topicId: string
  vote: FeedbackVote | null
  comment: string
  /** When true (General), comments may save without a thumbs vote. */
  allowCommentWithoutVote?: boolean
  onSave: (payload: {
    topicId: string
    vote?: FeedbackVote
    comment?: string
  }) => void
}

const COMMENT_DEBOUNCE_MS = 450

export function createFeedbackResponseFormMachine(input: FeedbackResponseFormInput) {
  const { onSave } = input
  const allowCommentWithoutVote = input.allowCommentWithoutVote ?? false

  return setup({
    types: {
      context: {} as FeedbackResponseFormContext,
      events: {} as FeedbackResponseFormEvent,
    },
    actions: {
      hydrate: assign(({ event }) => {
        if (event.type !== "HYDRATE") return {}
        return {
          vote: event.vote,
          comment: event.comment,
          savedVote: event.vote,
          savedComment: event.comment,
          savePending: false,
          rollbackVote: null,
          rollbackComment: null,
        }
      }),
      setVoteOptimistic: assign(({ context, event }) => {
        if (event.type !== "SET_VOTE") return {}
        return {
          rollbackVote: context.vote,
          rollbackComment: context.comment,
          vote: event.vote,
          savePending: true,
        }
      }),
      emitVoteSave: ({ context, event }) => {
        if (event.type !== "SET_VOTE") return
        onSave({ topicId: context.topicId, vote: event.vote })
      },
      setCommentDraft: assign(({ event }) => {
        if (event.type !== "SET_COMMENT") return {}
        return { comment: event.comment }
      }),
      emitCommentSave: ({ context }) => {
        onSave({ topicId: context.topicId, comment: context.comment })
      },
      markCommentSavePending: assign({
        savePending: true,
        rollbackVote: ({ context }) => context.vote,
        rollbackComment: ({ context }) => context.comment,
      }),
      syncSaved: assign(({ event }) => {
        if (event.type !== "SYNC_SAVED") return {}
        return {
          vote: event.vote,
          comment: event.comment,
          savedVote: event.vote,
          savedComment: event.comment,
          savePending: false,
          rollbackVote: null,
          rollbackComment: null,
        }
      }),
      rollback: assign(({ context }) => ({
        vote: context.rollbackVote ?? context.savedVote,
        comment: context.rollbackComment ?? context.savedComment,
        savePending: false,
        rollbackVote: null,
        rollbackComment: null,
      })),
      flushIfDirty: ({ context }) => {
        if (context.comment === context.savedComment) return
        if (!context.allowCommentWithoutVote && context.vote == null) return
        // Avoid creating an empty general response with no vote.
        if (
          context.allowCommentWithoutVote &&
          context.vote == null &&
          context.savedVote == null &&
          context.comment === "" &&
          context.savedComment === ""
        ) {
          return
        }
        onSave({ topicId: context.topicId, comment: context.comment })
      },
    },
    guards: {
      canComment: ({ context }) =>
        context.vote != null || context.allowCommentWithoutVote,
      commentDirty: ({ context }) => context.comment !== context.savedComment,
    },
  }).createMachine({
    id: `feedback-response-form-${input.topicId}`,
    context: {
      topicId: input.topicId,
      vote: input.vote,
      comment: input.comment,
      savedVote: input.vote,
      savedComment: input.comment,
      savePending: false,
      rollbackVote: null,
      rollbackComment: null,
      allowCommentWithoutVote,
    },
    initial: "idle",
    on: {
      HYDRATE: { actions: "hydrate" },
      SYNC_SAVED: { actions: "syncSaved" },
      SAVE_FAILED: { actions: "rollback" },
    },
    states: {
      idle: {
        on: {
          SET_VOTE: {
            actions: ["setVoteOptimistic", "emitVoteSave"],
          },
          SET_COMMENT: {
            guard: "canComment",
            target: "typing",
            actions: ["setCommentDraft"],
          },
          FLUSH: {
            guard: "commentDirty",
            actions: ["markCommentSavePending", "flushIfDirty"],
          },
        },
      },
      typing: {
        on: {
          SET_VOTE: {
            actions: ["setVoteOptimistic", "emitVoteSave"],
          },
          SET_COMMENT: {
            target: "typing",
            reenter: true,
            actions: ["setCommentDraft"],
          },
          FLUSH: {
            target: "idle",
            actions: ["markCommentSavePending", "flushIfDirty"],
          },
        },
        after: {
          [COMMENT_DEBOUNCE_MS]: {
            target: "idle",
            actions: ["markCommentSavePending", "emitCommentSave"],
          },
        },
      },
    },
  })
}
