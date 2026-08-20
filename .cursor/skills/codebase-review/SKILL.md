---
name: codebase-review
description: >-
  Post-feature maintainability review for Listening Room: pattern adherence
  (including XState over orchestrating useState), architectural integrity, DRY,
  modularity, and documentation drift. Produces a prioritized refactor plan with
  opt-outable items. Use after significant feature work, when the user asks for a
  codebase review, refactor suggestions, sprawl check, spaghetti audit, or
  maintainability pass for humans and AI agents.
---

# Codebase Review (Listening Room)

After significant feature work, audit the touched area for sprawl and produce a
**refactor plan** the user can opt out of item-by-item. Do **not** implement
refactors in this pass unless the user explicitly asks after the plan.

Pairs with: `adrs` (constraints), `draft-plan` / `review-plan` / `build-step`
(optional follow-through on accepted items).

## Ask before running

Do **not** start the audit until the user confirms the review boundary.
Ask once (prefer `AskQuestion` if available), with a recommended default:

1. **Boundary** (required)
   - Recommended: files changed on this branch vs base (`main` / tracked upstream),
     plus one hop of callers/callees in the same feature area
   - Alternatives: uncommitted changes only; named packages/paths; a specific
     feature/PR; broader layer audit (e.g. all of `packages/server/operations`)
2. **Depth** (optional if obvious)
   - Recommended: standard (patterns + DRY + docs in boundary)
   - Alternatives: quick scan; deep (include cross-package duplication hunt)
3. **Plan name** (optional)
   - Default: `plans/codebase-review-<kebab-area>.plan.md`
     (must end in `.plan.md` so Cursor's plan preview UI picks it up)

If the user already specified boundary in the same message, confirm in one line
and proceed — do not re-ask.

## Constraints

### MUST

- Read `AGENTS.md` and `CLAUDE.md` before judging patterns.
- Read relevant Accepted ADRs via `docs/adrs/index.md` (use the `adrs` skill
  workflow). Treat Accepted ADRs as constraints; flag violations as findings.
- Ground every finding in real paths/symbols. No generic advice.
- Prefer **small, reversible** refactors over rewrites.
- Save a written plan (see Output). Mark each actionable item so the user can
  opt out by ID.
- End by listing item IDs and asking which to keep / drop / defer. Do not start
  implementation until the user confirms the kept set.

### MUST NOT

- Implement code changes during the review pass.
- Expand scope past the agreed boundary without asking.
- Propose changes that contradict Accepted ADRs without an explicit
  "propose superseding ADR" finding.
- Nitpick style already enforced by linters/formatters unless it harms
  agent/human navigation (e.g. god files, unclear module boundaries).
- Duplicate Bugbot/security review — skip pure bug hunts and vuln hunting
  unless they block a maintainability finding.

## Workflow

```
Review progress:
- [ ] Boundary confirmed
- [ ] AGENTS.md / CLAUDE.md skimmed for touched layers
- [ ] Relevant ADRs identified and read
- [ ] Diff / target paths inventoried
- [ ] Pattern + architecture pass (incl. XState vs orchestrating `useState`)
- [ ] DRY + modularity pass
- [ ] Documentation drift pass
- [ ] Plan written with opt-outable items
- [ ] User chose keep / drop / defer
```

### 1. Inventory

From the agreed boundary, list:

- Changed/added files (group by layer: handlers, operations, services, actors,
  machines, plugins, adapters, types, docs)
- New public surfaces (Socket events, system events, exports, plugin config,
  REST routes)
- New or shifted responsibilities (who owns the logic now?)

### 2. Pattern adherence (Listening Room)

Check only what the boundary touches:

| Area | Expect |
|------|--------|
| Socket handlers | Thin; live in `packages/server/handlers/`; exported/registered per AGENTS.md |
| Business logic | `packages/server/operations/` — not in handlers or React |
| Domain events | Emitted from operations only ([ADR 0014](docs/adrs/0014-emit-domain-events-from-operations-only.md)); types in `packages/types/SystemEventTypes.ts` |
| SystemEvents / broadcasters | No ad-hoc Socket emits that bypass the pattern ([ADR 0008](docs/adrs/0008-system-events-and-broadcaster-pattern.md)) |
| Controllers | HOF + closure / AppContext DI ([ADR 0010](docs/adrs/0010-controller-hof-closure-pattern.md), [ADR 0011](docs/adrs/0011-dependency-injection-via-app-context.md)) |
| Room-type branching | `roomTypeHelpers` (server + web), not scattered `room.type ===` |
| Frontend state | XState v5 `setup()`, machines in `machines/`, actors in `actors/` ([ADR 0004](docs/adrs/0004-state-machines-for-ui-and-socket-events.md)); room-scoped ACTIVATE/DEACTIVATE. Prefer machines over React `useState` when the state orchestrates multiple components — see **XState vs `useState`** below |
| Socket hub | New server→client traffic via `socketActor` broadcast patterns, not one-off wiring |
| Plugins | Extend `BasePlugin`; Zod config; declarative components; Redis storage via plugin APIs |
| Adapters | `MediaSourceAdapter` shape; registered in api + `configureAdaptersForRoomType` |
| Events naming | SCREAMING_SNAKE_CASE on the wire ([ADR 0009](docs/adrs/0009-screaming-snake-case-for-socket-events.md)) |
| Game Studio | Room UI / socket surface changes mirrored in `apps/studio-bridge` when applicable |

#### XState vs `useState` (web app)

The web client’s default for **non-trivial UI state** is XState, not React local state
([ADR 0004](docs/adrs/0004-state-machines-for-ui-and-socket-events.md),
[apps/web/README.md](apps/web/README.md)). Reviewers should treat lifted / shared
`useState` as a smell when it is really an **orchestrator** for many components.

**Prefer a machine (existing actor, new domain actor, or component-local machine)** when:

- The state is a **feature orchestrator**: open/selected/step, which pane is showing,
  which item is inspected, multi-step flow, or “who owns this view” — and **more than
  one component** reads or writes it (props drilling, context-as-store, or a parent
  `useState` that siblings all depend on).
- Transitions have **invalid combinations** (e.g. detail view without a selected id,
  shop open while another modal owns the stack) that a machine would make impossible.
- Multiple surfaces need to **trigger the same flow** (modals, admin panels, plugin
  components, inventory → item detail). Prefer sending events to an existing actor
  (`modalsActor`, etc.) over a new island of `useState`.
- The state is **room-scoped**, socket-driven, or must survive unmount of the widget
  that first opened it (ACTIVATE/DEACTIVATE, `socketActor` subscriptions).
- The same concern is already modeled as a machine nearby; a parallel `useState`
  path is a second pattern.

**Leave `useState` / local refs** when they are truly component-private:

- Ephemeral presentation: hover, focus, one-off animation, a single accordion open.
- Uncontrolled-adjacent form field values that never leave the widget.
- Derived UI that is not a domain (e.g. “is this tooltip mounted”).

**Do not** propose a new singleton actor for every toggle. Prefer, in order:
(1) events on an existing actor, (2) a small machine colocated with the feature
(`useMachine` / `useSocketMachine`) when the tree is local but the flow is real,
(3) a new `machines/` + `actors/` pair when the domain is app- or room-wide.

**Out of scope unless the boundary includes them:** `apps/scheduler` uses TanStack
Query + Form, not XState, for CRUD ([ADR 0017](docs/adrs/0017-scheduling-app-for-show-programming.md)).
Do not apply this preference there.

Flag as a finding when a parent (or ad-hoc context) holds orchestrating `useState`
that several children coordinate through, instead of explicit machine states and
events. Severity: **P1** if the flow is already multi-surface or growing; **P2** if
it is still one tree but clearly heading that way; skip isolated widgets.

### 3. Architectural integrity

Flag:

- Layer leaks (UI → Redis/DB; handler → external API; plugin → deep server internals)
- Parallel patterns for the same problem (second event bus, ad-hoc global, duplicate room-type predicates)
- Missing ownership (logic stranded in components, one-off utils with no home; orchestrating UI state living in React `useState` instead of an XState machine — see **XState vs `useState`**)
- Features that needed an ADR but lack one (new pattern, boundary, or dependency)
- Broken symmetry (server helper exists, client re-implements; types duplicated across packages)
- New functionality landed in core (`packages/server`, `apps/web`, etc.) that should be a plugin unless it is truly core to the experience ([ADR 0006](docs/adrs/0006-plugin-system-for-room-features.md))
- Core updates that introduce useful capability without exposing it to plugins (events, `PluginContext.api`, shared helpers) when plugins are the intended extension point

### 4. DRY and modularity

Flag:

- Copy-pasted branches that should share a helper (especially room-type, auth failure, track identity)
- Modules growing past a single responsibility (candidates to split)
- Useful helpers buried in feature files instead of `@repo/utils` / layer libs
- Premature abstraction — only suggest extraction when duplication is real (≥2 call sites or clear third coming)

### 5. Documentation drift

Compare code to:

- `AGENTS.md` / `CLAUDE.md` (structure, common tasks, pattern tables)
- `docs/adrs/` (decisions vs implementation)
- Layer guides when touched: `docs/BACKEND_DEVELOPMENT.md`, `docs/PLUGIN_DEVELOPMENT.md`, `apps/web/README.md`, `apps/game-studio/README.md`

Flag stale paths, missing common-task steps, and Accepted ADRs that no longer match code (drift note — do not silently "fix" ADR text; recommend follow-up ADR or doc PR).

## Finding severity

| Severity | Meaning |
|----------|---------|
| **P0** | Violates an Accepted ADR or established layer boundary; will spawn copy-paste bugs |
| **P1** | Clear duplication or modularity issue in-boundary; should fix before next feature lands nearby |
| **P2** | Doc drift, naming consistency, or small cleanup that improves agent/human navigation |
| **P3** | Optional polish; defer freely |

## Output

### Inline summary (short)

1–3 sentences: overall maintainability verdict for the boundary (healthy / mixed / sprawl risk).

### Plan file

Save to `plans/codebase-review-<kebab-area>.plan.md` (ask before overwrite).

**Cursor plan preview:** The file **must** use the `.plan.md` suffix and start
with YAML frontmatter (`name`, `overview`, `todos`, `isProject`). Without
that, Cursor opens it as plain markdown instead of the interactive plan UI.
Map each refactor item `R#` to a frontmatter todo (`id: r1`, etc.). Use
`status: pending` initially; after opt-out, set kept → `pending` (or
`in-progress` / `completed` as work proceeds), dropped → omit or
`cancelled`, deferred → leave `pending` and note in the body.

```markdown
---
name: Codebase review — <area>
overview: <one-line verdict / scope summary>
todos:
  - id: r1
    content: "R1 — <title>"
    status: pending
  - id: r2
    content: "R2 — <title>"
    status: pending
isProject: false
---

# Codebase review: <area>

**Date:** YYYY-MM-DD
**Boundary:** <agreed scope>
**Verdict:** <one line>

## Findings

| ID | Sev | Title | Location | Rationale |
|----|-----|-------|----------|-----------|
| F1 | P0 | … | `path` / symbol | … |

## Refactor plan (opt-out)

Each item is independent unless **Depends** says otherwise. Default: all
included. User will reply with IDs to drop/defer.

### R1 — <title>
- **Addresses:** F1, F2
- **Depends:** none | R#
- **Files:** …
- **Change:** 1–3 sentences, concrete
- **Done means:** verifiable outcome
- **Risk:** one line

### R2 — …
…

## Documentation updates
- [ ] … (AGENTS.md / ADR / layer guide) — or "none"

## Explicit non-actions
- … (reviewed, left as-is, with reason)

## Opt-out checklist

Reply with decisions (keep is default):

- [ ] R1 — keep / drop / defer
- [ ] R2 — keep / drop / defer
…
```

### After the plan

1. Show the opt-out checklist and wait.
2. Apply the user's keep/drop/defer choices in the plan file (`Status:` per
   body item **and** matching frontmatter `todos[].status`).
3. Only if they ask to implement: hand off to `build-step` one item at a time
   (or implement the kept set if they explicitly request a single implementation pass).

## Done means

- Boundary was confirmed before the audit
- Findings cite real files/symbols and map to ADR/AGENTS patterns where relevant
- Plan saved as `*.plan.md` with Cursor frontmatter (`name`, `overview`,
  `todos`, `isProject`) plus opt-outable `R#` items and a checklist
- No code was changed unless the user explicitly approved implementation after opt-out
