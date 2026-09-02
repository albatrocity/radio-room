# 0146. Feedback overlays the integrated panel

**Date:** 2026-09-02
**Status:** Accepted

## Context

[ADR 0128](0128-add-to-queue-overlays-integrated-panel.md) carved Add to Queue into a parallel `modalsMachine` region so it would not replace docked Game State / Admin Settings. Listener Feedback ([ADR 0145](0145-feedback-topics-as-core-feature.md)) was initially a `modal.feedback` state in the exclusive `modal` region, so opening it from Preferences collapsed the integrated panel — the same failure mode Add to Queue had.

Feedback is also a transient overlay (dialog), not a panel slot. Listeners should keep Game State / Settings docked while answering topics.

## Decision

1. Add a third parallel region on `modalsMachine`: `feedback` (`closed` | `open`).
2. `VIEW_FEEDBACK` → `feedback.open`; `CLOSE_FEEDBACK` → `feedback.closed`. These do not leave `modal.gameState` / `modal.settings`.
3. Notification location entry/exit for the listener surface stays on `feedback.open` (ADR 0144 / 0145). Admin Settings → Feedback remains `modal.settings.feedback` (unchanged).
4. `matchesModals(state, "feedback")` and `isModalsIdle` understand the new region; `closeModal()` prefers `CLOSE_FEEDBACK` when that overlay is open.

## Consequences

- Preferences → Feedback no longer collapses the lg+ panel column.
- Two (or three) layers can be open: panel + queue + feedback. Dismiss events stay scoped (`CLOSE` / `CLOSE_QUEUE` / `CLOSE_FEEDBACK`).
- Extends the ADR 0128 overlay pattern; does not move other exclusive overlays (poll history, …). **Help / Room guide** later joined the same pattern (`help` parallel region + `CLOSE_HELP`).

## See also

- [0128. Add to Queue overlays the integrated panel](0128-add-to-queue-overlays-integrated-panel.md)
- [0145. Feedback topics as a core feature](0145-feedback-topics-as-core-feature.md)
- [0117. Integrated room panel slot (lg+)](0117-integrated-room-panel-slot.md)
