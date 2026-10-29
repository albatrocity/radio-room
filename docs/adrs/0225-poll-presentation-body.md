# 0225. Poll presentation body

**Date:** 2026-10-29
**Status:** Accepted

## Context

A road-trip poll renders as a highway sign ([0208](0208-presentation-themes.md)). The sign's headline is the stop or shortcut name, and `Poll.question` is the sentence the room is answering. The theme draws the headline and leaves the question for poll history and unthemed cards. An authored question — a shortcut's "Question", a site's skip-poll question, an event choice's question — never appeared on the open poll.

## Decision

1. **`Poll.presentation` gains optional `body`.** A string of at most 120 characters, the sentence under the headline. `createPoll` still keeps presentation only for plugin-sourced polls and validates it with the same schema. Voting ignores the field.
2. **The road-trip poll theme draws `body` under the headline**, in sentence case. The collapsed label uses `body` when it is set, then the headline. A missing `body` leaves the sign as it was.
3. **Road-trip sets `body` to an authored question.** A shortcut vote and a site skip poll set it only when the map has a question; a blank question keeps the name-only sign, and the generated sentence stays on `poll.question`. An event choice always sets it, because that question is the prompt.

## Consequences

- Listeners see the question the map author wrote, on the same sign as the name.
- Old clients ignore `body`. The question is still `poll.question`, so history and a plain card still show it.
- A `body` that fails the schema drops the whole presentation, and the poll falls back to the plain card. Road-trip only copies questions the map schema already caps at 120 characters.

## See also

- [0208. Presentation themes](0208-presentation-themes.md)
- [0222. Trip flow and branches](0222-trip-flow-and-branches.md)
