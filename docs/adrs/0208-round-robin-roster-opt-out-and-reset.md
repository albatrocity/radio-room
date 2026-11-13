# 0208. Round Robin roster opt-out and reset

**Date:** 2026-11-13
**Status:** Accepted

## Context

Round Robin DJ ([ADR 0091](0091-round-robin-dj-plugin.md)) seeds its roster from current deputies and mirrors eligibility with the Robin persona. Room admins who are also deputies are included. Admins always bypass the queue gate, but a round still waits until every participant has queued, and Advance round locks every participant into the order.

The persona is `assignableByAdmin`. Taking Robin off someone was treated as drift: `PERSONA_REMOVED` re-synced eligibility and put the badge back. A later sync fingerprint short-circuit left the badge off while the user stayed in `participants`, so they remained in the rotation with no Robin label. Shows need an admin to step out of the lineup, then start a real round 1 with whoever is left. Advance round cannot do that — it starts the next pass from the existing order ([ADR 0151](0151-round-robin-forward-and-back-mode.md)).

## Decision

1. **Admin removal is an opt-out.** `PERSONA_REMOVED` for Robin, when the plugin did not itself remove it, drops that user from the roster via `removeUser` (participants, order, queued-this-round, and any hold) and records them in `optedOutUserIds`. Persona sync must not assign Robin back. A system message says they left the rotation. Persona toggles also emit `USER_JOINED` ([ADR 0057](0057-user-personas-system.md)); that refresh must not call `addDeputy` for an opted-out user, or the next sync paints Robin onto whoever the join reintroduced. `DEPUTY_DJ_CHANGED` (including deputize-all) and admin Robin assignment clear the opt-out and add them back. A real rejoin while still a deputy does not.

2. **Plugin badge moves are not opt-outs.** `RobinPersonaSync` sets a depth flag around its own assign/remove (and clear-on-disable). `PERSONA_REMOVED` during that window is ignored, so a turn change does not eject the deputy who just queued.

3. **Admin-forced Robin is unchanged.** In non-sequential mode, removing the exclusive Robin still only clears `adminForcedUserId`. That person stays on the roster and eligibility falls back to first-come.

4. **`resetRounds` admin action** (settings and Quick Access, with confirm) replaces state with `createInitialState(mode, current participants)`: round 1, open discovery, forward direction, empty order. Holds are cleared and not flushed. It does not re-read the deputy list, so opt-outs stick. Assigning Robin again, or a later deputize, adds someone back.

5. **Advance round is unchanged.** It still locks any open discovery order and starts the next pass.

## Consequences

- An admin can leave the rotation without undepotizing. Their queue adds still succeed through the admin bypass and do not spend a robin turn.
- Removing Robin mid-round drops that person from the order immediately. It does not only skip the current turn.
- Reset discards in-progress discovery and any locked order. The confirm dialog is the guard.
- New deputies still join on `DEPUTY_DJ_CHANGED`. A deputy who already opted out stays out across `USER_JOINED` (persona toggle or rejoin) until someone deputizes them again or assigns Robin. Bulk deputize-all clears opt-outs.

## See also

- [0091. Round Robin DJ plugin](0091-round-robin-dj-plugin.md)
- [0151. Round Robin forward-and-back mode](0151-round-robin-forward-and-back-mode.md)
- [`packages/plugin-round-robin-dj/`](../../packages/plugin-round-robin-dj/)
