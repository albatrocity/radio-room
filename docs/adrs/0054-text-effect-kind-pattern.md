# 0054. Text Effect Kind Pattern + Flag Stack Map

**Date:** 2026-05-11  
**Status:** Accepted

## Context

Chat text mutations for item-shop pedals mixed concerns: fixed flag stack counting (`TextEffectStacks` with named fields), item-specific string transforms (`coffee`, `snooze`, `gate`) implemented inside `@repo/plugin-base`, and wire-format color effects using an ad hoc enum mapped manually to Chakra tokens in `@repo/game-logic`. Adding a new pedal required edits across game-logic enum-like structs, plugin-base transforms, and types—classic abstraction leakage.

## Decision

1. **Introduce `TextEffectKind`** in `@repo/plugin-base`: a discriminated union over pipeline phases (`content`, `word`, `segment`, `decorate`, `multiply`) plus `activeWhen` (flag string or predicate over stacks). Per-word callbacks receive **`WordContext`** (`wordIndex`, `wordCount`, `allWords`) so kinds can target one word in a message (e.g. longest-word highlight).
2. **`applyTextEffects(content, stacks, kinds)`** is the only runner in plugin-base; **item-shops** aggregates `TEXT_EFFECT_KINDS` and passes it next to stacks from **`countFlagStacks(modifiers, now)`** in `@repo/game-logic`—a generic **`Record<string, number>`** counting one stack per non-expired modifier per distinct `flag` name (same semantics as before, without hardcoded keys).
3. **Flag string constants** are split by scope. **Cross-folder (shared) flags**—written by one item and read by `TextEffectKind`s elsewhere—are named exports of **`packages/plugin-item-shops/items/textEffects/sizeShift.ts`** (`GROW_FLAG`, `SHRINK_FLAG`, `ECHO_FLAG`). **Self-contained flags**—where one item is both sole writer and sole reader of the bucket (e.g. `gate`, `coffee`, `snooze`, `scramble`, `joker`)—are declared as a local `const` at the top of the item file and never re-exported. The item wizard inlines newly-created flags this way. No central flags file. **`echoTextEffect`** inherits non-`size` effects from each word's base segments onto echo segments so font/color decorate kinds need no coupling to echo.
4. **`TextEffect` color variant** uses **`{ type: "color", palette, token? }`** where `palette` is a Chakra default palette name and `token` is a semantic token (`subtle`, `solid`, `fg`, …). **`textEffectStyles`** maps this to **`${palette}.${token}`** so Chakra resolves light/dark; remove bespoke per-color mappings.

## Consequences

### Positive

- New pedals add a flag row + an exported kind next to the item; no central enum explosion.
- Cross-flag behavior (grow/shrink/echo; echo inherits decorate fonts from base segments) stays in item-owned modules (`sizeShift.ts`).
- Color styling aligns with [Chakra theming/colors](https://chakra-ui.com/docs/theming/colors).

### Negative / trade-offs

- **`contentSegments` color shape is breaking** vs `{ type: "color", value: "orange" }`; canonical chat `content` is unchanged (ADR 0044). Historical payloads with old segments may render oddly until refreshed.
- **`countTextEffectStacks` removed**; callers use **`countFlagStacks`** and string keys (e.g. `"grow"`) matching shared exports from `textEffects/sizeShift.ts` or the inline `const` declared next to the owning item.

## References

- [ADR 0056 — Segment phase pipeline merge](0056-segment-phase-pipeline-merge.md) (how multiple `segment` kinds compose in `applyTextEffects`)
- [ADR 0042 — Game Sessions and Inventory](0042-game-sessions-and-inventory.md)
- [ADR 0044 — Plugin Chat Message Transform + Text Segments](0044-plugin-chat-message-transform-and-text-segments.md)
- [ADR 0046 — Derived Modifier Flags](0046-derived-modifier-flags.md)
- `packages/plugin-base/helpers/textTransform/types.ts`
- `packages/plugin-base/helpers/textTransform/pipeline.ts`
- `packages/game-logic/src/textEffectStacks.ts`
- `packages/types/ChatMessage.ts`
