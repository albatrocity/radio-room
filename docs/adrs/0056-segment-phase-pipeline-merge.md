# 0056. Segment phase pipeline merge in `applyTextEffects`

**Date:** 2026-05-13  
**Status:** Accepted

## Context

`applyTextEffects` in `@repo/plugin-base` ran all active `phase: "segment"` kinds in `order`, but only the first non-null `build` result per word was kept; additional segment kinds logged a conflict warning and were ignored. That made independent item-owned segment effects mutually exclusive (e.g. carrots’ orange `i`/`I` and tomatoes’ red `o`/`O` on the same message).

## Decision

1. **Refine-in-place pipeline:** After the first segment kind produces `TextSegment[]` for a word, each subsequent active segment kind calls `build(seg.text, stacks, ctx)` on **each** existing segment’s `text`.
2. **When `build` returns `null` or an empty array** for a sub-segment, that segment is left unchanged (including its existing `effects`).
3. **When `build` returns non-empty segments**, each child’s `effects` become **`[...parent.effects, ...child.effects]`** (parent effects first, then the refining kind’s additions). Empty merged lists become `undefined`.
4. **`TextEffectKind` signatures are unchanged** ([ADR 0054](0054-text-effect-kind-pattern.md)); segment `build` continues to take a plain string, so existing kinds work when invoked on substrings.

## Consequences

### Positive

- Multiple segment kinds compose without merging item code (e.g. carrots + tomatoes).
- `order` among segment kinds still controls refinement order (earlier kinds establish coarser splits; later kinds subdivide).

### Negative / trade-offs

- Authors must assume later segment kinds may see **substring** `word` arguments, not always the full token—already true for any split-first design; now it is guaranteed when multiple kinds are active.
- Very deep refinement chains could produce many small segments (same as deeply nested manual splits).

## References

- [ADR 0054 — Text Effect Kind Pattern](0054-text-effect-kind-pattern.md)
- `packages/plugin-base/helpers/textTransform/pipeline.ts`
