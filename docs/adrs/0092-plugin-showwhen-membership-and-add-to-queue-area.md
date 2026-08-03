# 0092. Plugin showWhen Membership Operators and `addToQueue` Area

**Date:** 2026-08-03
**Status:** Accepted

## Context

Plugin component stores fan out room-wide ([ADR 0061](0061-poll-voting-as-core-feature.md)). Features such as Round Robin DJ ([ADR 0091](0091-round-robin-dj-plugin.md)) need per-viewer copy in the Add to Queue modal (“It’s your turn” vs “It’s Alice’s turn”) without private per-user stores or plugin-specific React templates. Existing `showWhen` only supported equality against config, store, or `item.*` context.

## Decision

1. **New component area `addToQueue`** — mounted above the search form in the Add to Queue modal (`ModalAddToQueue` → `<PluginArea area="addToQueue" />`).

2. **Viewer context paths** — `showWhen` field / membership paths may use `viewer.*` (at least `viewer.userId`, `viewer.isAdmin`), resolved from the current authenticated user on the client.

3. **Membership operators** — `ShowWhenCondition` may include optional `includes` or `notIncludes` (a path string). When set, `field` must resolve to an array and the resolved member must / must not be contained; equality `value` is ignored. Evaluation lives in `@repo/utils` (`checkShowWhenCondition` / `checkShowWhenConditions`) and is used by the web `PluginComponentRenderer`.

4. **Room-wide entitlement ids remain acceptable** for non-secret roster/turn state (same visibility class as Robin personas and system chat). Hold track payloads must not be published via the component store.

## Consequences

- Plugins can declare viewer-relative UI with declarative schemas (e.g. Round Robin messages in `addToQueue`).
- `ShowWhenCondition.value` is optional when using membership operators; equality remains the default.
- Clients that render plugin components must supply viewer context when evaluating `showWhen`.

## See also

- [0006. Plugin system](0006-plugin-system-for-room-features.md)
- [0091. Round Robin DJ plugin](0091-round-robin-dj-plugin.md)
- [`docs/plugins/components.md`](../plugins/components.md)
