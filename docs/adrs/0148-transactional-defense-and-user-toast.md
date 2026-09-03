# 0148. Transactional defense check and user toast

**Date:** 2026-09-02
**Status:** Accepted

## Context

Some inventory items (e.g. Black Bag) are **transactional**: they transfer or grant items without applying a lasting game-state modifier. Passive defense ([ADR 0050](0050-inventory-defense-items.md) / [0053](0053-targeted-item-use-defense-intercept.md)) still needs to run — Warranty / Honeypot / Rubber Band should consume and block — but probing via `applyTimedModifier` leaves a duration effect on the victim, and Rubber Band’s `onDefenseTriggered` **rebounds** that probe onto the attacker.

Victims of a successful steal need an immediate, ephemeral alert. Chat (`sendUserSystemMessage`) persists in the message list; the notification center ([ADR 0144](0144-client-notification-center.md)) is for attention records + optional toasts with indicators. Neither fits “red toast only, no badge, no persistence.”

## Decision

1. **`GameSessionPluginAPI.checkModifierDefense(userId, modifier, actorUserId?, options?)`** — Runs the same passive modifier defense path as `applyModifier` (consume matching stack, optional `onDefenseTriggered`, `GAME_EFFECT_BLOCKED` + room block alert) **without** persisting a modifier. Returns `{ ok: true }` when clear, or the same failure shapes as apply (`defense_blocked` / `no_active_session`).

2. **`options.omitBlockedModifier`** — When `true`, `DefenseTriggeredPayload.blockedModifier` is omitted. Rebound defenses (Rubber Band) still **consume and block**, but do not call `reboundModifier`. Honeypot and similar handlers that key off `attackerItemDefinition` are unchanged.

3. **Probe modifiers for transactional uses** — Callers may pass a short-lived probe (e.g. negative-intent flag) solely so targeting still matches Warranty’s `intents: ["negative"]`. The probe is never applied when using `checkModifierDefense`.

4. **`PluginAPI.sendUserToast(roomId, userId, toast)`** — Private socket emit `USER_TOAST` to one connected client (same delivery model as `sendUserSystemMessage`). Payload: `{ title, description?, type?, duration?, id?, source? }`. Not a SystemEvent / Redis fan-out.

5. **Client** — On `USER_TOAST`, raise an ADR 0144 notification with `target: null` (toast-only: no indicator record, no `persist`). Default `type: "error"` is allowed for hostile notices (e.g. item stolen).

## Consequences

- **Positive:** Transactional attacks share core defense without fake duration effects or unwanted rebounds; victims get a clear ephemeral signal without chat clutter or badges.
- **Negative:** Callers must choose `checkModifierDefense` vs `applyTimedModifier`; forgetting `omitBlockedModifier` on a probe still rebounds via Rubber Band.
- **Related:** [0050](0050-inventory-defense-items.md), [0053](0053-targeted-item-use-defense-intercept.md), [0144](0144-client-notification-center.md), [0147](0147-user-inventory-peek.md).
