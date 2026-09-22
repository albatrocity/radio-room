# 0189. Poll `closesAt` auto-close

**Date:** 2026-09-22
**Status:** Accepted

## Context

`Poll.closesAt` existed in the schema and Redis hash ([ADR 0061](0061-room-polls.md)) but
`createPoll` always wrote `null` and nothing enforced a deadline. Plugins that needed
timed polls (Kickstarter delivery accountability) ran their own in-memory timers and
called `closePoll` themselves — fragile across restarts and duplicated per plugin.

## Decision

1. **`createPoll` accepts `closesAt` and/or `durationMs`.** Bounds: 5 seconds to 24 hours.
   Socket/admin callers send `durationMs` (client computes target − client now) so server
   clock skew does not shift the deadline. Plugins in-process may pass absolute `closesAt`.

2. **Schedule in Redis:** when `closesAt` is set, `ZADD polls:closing` with member
   `${roomId}:${pollId}` and score `closesAt`. Survives restarts with no in-memory timers.

3. **Sweep job** `poll-autoclose` runs every second. It reads due members, then `ZREM` —
   returning `1` is the claim — so multiple dynos never double-close. Claimed polls call
   `closePoll` with `source: { system: "autoClose" }` and `reason: "expired"`.

4. **Announce inheritance:** create-time `announce` is stored as hash field `announceClose`
   (not on the public `Poll` payload) and reused when the job closes.

5. **Vote cutoff:** `tryCastVote` rejects when `Date.now() >= closesAt` even if the sweep
   has not run yet.

6. **`POLL_CLOSED` includes `reason: "manual" | "expired"`** so plugins can branch without
   racing their own timers.

7. **Admin UI:** PollAuthor “Closes” field accepts plain language (`20 seconds`, `10m`,
   `10:30pm`); empty means no deadline. PollCard shows `ExpiryBar` when `closesAt` is set.

## Consequences

- Plugins should pass `closesAt`/`durationMs` and listen for `POLL_CLOSED` instead of
  arming a close timer (Kickstarter delivery poll does this).
- ~1s precision is acceptable for room polls.
- Queue Theme polls remain track-driven and do not set `closesAt`.

## See also

- [0061](0061-room-polls.md) — room polls (deferred auto-close completed here)
- [0152](0152-plugin-authored-core-polls.md) — plugin-authored core polls
- [0188](0188-kickstarter-campaigns-coin-escrow.md) — Kickstarter delivery poll consumer
