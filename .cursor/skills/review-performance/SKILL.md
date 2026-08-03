---
name: review-performance
description: >-
  Performance and scalability review for Listening Room: Socket.IO fanout,
  Redis/hot paths, N+1 and unbounded growth, React/XState re-render traps, and
  other bottlenecks. Produces a prioritized plan with opt-outable items. Use
  when the user asks for a performance review, scalability pass, bottleneck
  hunt, load-readiness check, or flags slow room/UI/backend behavior.
---

# Performance Review (Listening Room)

Audit the agreed boundary for scalability issues and antipatterns that could
cause performance bottlenecks. Produce a **plan** the user can opt out of
item-by-item. Do **not** implement fixes in this pass unless the user
explicitly asks after the plan.

**Scale context (default):** Today ≈ one show/room a month with average
concurrent users below 100, but growth is plausible. Prioritize findings that
hurt at current load; still surface growth risks, clearly labeled.

Pairs with: `adrs` (constraints), `codebase-review` (maintainability — do not
duplicate that pass), `draft-plan` / `review-plan` / `build-step` (optional
follow-through).

## Ask before running

Do **not** start the audit until the user confirms the review boundary.
Ask once (prefer `AskQuestion` if available), with a recommended default:

1. **Boundary** (required)
   - Recommended: files changed on this branch vs base (`main` / tracked upstream),
     plus one hop of callers/callees on hot paths (emit → broadcaster → client;
     Redis read/write; actor subscriptions)
   - Alternatives: uncommitted changes only; named packages/paths; a specific
     feature/PR; broader layer audit (e.g. all of `packages/server/operations`,
     room join path, playlist/queue path)
2. **Depth** (optional if obvious)
   - Recommended: standard (hot-path antipatterns + current-load risks)
   - Alternatives: quick scan; deep (include cross-package fanout / memory growth)
3. **Plan name** (optional)
   - Default: `plans/review-performance-<kebab-area>.plan.md`
     (must end in `.plan.md` so Cursor's plan preview UI picks it up)

If the user already specified boundary in the same message, confirm in one line
and proceed — do not re-ask.

## Constraints

### MUST

- Read `AGENTS.md` and `CLAUDE.md` before judging architecture-shaped “fixes.”
- Read relevant Accepted ADRs via `docs/adrs/index.md` (use the `adrs` skill
  workflow). Do not propose optimizations that break Accepted ADR patterns
  without an explicit “propose superseding ADR” finding.
- Ground every finding in real paths/symbols and a concrete failure mode
  (CPU, latency, memory, Redis ops, socket bandwidth, client jank). No generic
  advice.
- Prefer **small, reversible** mitigations over speculative rewrites.
- Frame severity against **current load** vs **growth** (see Finding severity).
- Save a written plan (see Output). Mark each actionable item so the user can
  opt out by ID.
- End by listing item IDs and asking which to keep / drop / defer. Do not start
  implementation until the user confirms the kept set.

### MUST NOT

- Implement code changes during the review pass.
- Expand scope past the agreed boundary without asking.
- Duplicate `codebase-review` (DRY/sprawl/docs) or Bugbot/security review —
  mention overlap in one line and move on unless it is also a performance issue.
- Propose premature micro-optimizations (micro-benchmark theater, memoization
  everywhere, caching without invalidation story) when there is no plausible
  bottleneck at current or near-term growth load.
- Recommend infra scaling (extra Redis, multi-node Socket.IO) as the first fix
  when an algorithmic / fanout / N+1 issue is the real cause.

## Workflow

```
Review progress:
- [ ] Boundary confirmed
- [ ] AGENTS.md / CLAUDE.md skimmed for touched layers
- [ ] Relevant ADRs identified and read
- [ ] Diff / target paths inventoried (hot paths called out)
- [ ] Server / Redis / Socket fanout pass
- [ ] Plugin / adapter / media path pass (if in boundary)
- [ ] Client (React / XState / socketActor) pass
- [ ] Plan written with opt-outable items
- [ ] User chose keep / drop / defer
```

### 1. Inventory

From the agreed boundary, list:

- Changed/added files (group by layer: handlers, operations, services,
  broadcasters, actors, machines, plugins, adapters, web components)
- Hot paths touched: room join, presence, chat, queue/playlist, playback/
  now-playing, plugin component state, admin/config, media bridge RPC
- Per-event or per-request work that scales with **users**, **queue length**,
  **message history**, **plugin count**, or **poll frequency**

### 2. Server / Redis / Socket.IO

Flag (only what the boundary touches):

| Smell | Why it hurts |
|-------|----------------|
| Work in handlers that belongs in operations, or sync heavy work on the socket turn | Head-of-line blocking for that connection / event loop stall |
| Per-user Redis round-trips in a loop (N+1) | Latency × online users |
| Unbounded `KEYS`, full-set scans, or loading entire collections when a slice/id set would do | Redis CPU + memory spikes |
| Large payloads broadcast to the room on high-frequency events | Bandwidth × concurrent listeners |
| Re-broadcasting full snapshots where a delta would do | Same |
| Room-wide emit for data only one user needs | Wasted fanout |
| Bypassing SystemEvents / broadcasters with ad-hoc emits | Harder to reason about fanout; often duplicates work ([ADR 0008](docs/adrs/0008-system-events-and-broadcaster-pattern.md)) |
| Timers / intervals per user or per socket without clear teardown | Leak under reconnect churn |
| Serializing huge objects (full room + playlist + users) on every minor change | CPU + GC on api process |
| Plugin storage read/write on every event without coalescing | Redis + plugin CPU under chat/reactions load |

### 3. Plugins / adapters / media

Flag when in boundary:

- Plugin handlers doing O(users × tracks) or scanning full history per event
- Component schema / state updates that push large trees to all clients frequently
- Adapter polling or metadata refresh tighter than needed; stampeding on reconnect
- Bridge / daemon RPC on a hot interactive path without timeout/backoff
- Grant/list metadata source calls inside tight loops

### 4. Client (web)

Flag when in boundary:

| Smell | Why it hurts |
|-------|----------------|
| High-frequency socket events causing whole-tree React re-renders | UI jank at ~50–100+ clients’ worth of events |
| Actors/components subscribing to oversized context instead of selecting slices | Same |
| Missing ACTIVATE/DEACTIVATE or listener cleanup on room exit | Leaks / duplicate handlers across room navigations |
| Deriving heavy lists in render without need (sort/filter large queues every tick) | Main-thread cost |
| Chat/presence/queue lists without virtualization **only if** the boundary already grows those lists unboundedly | DOM cost; note current typical sizes |
| Eager fetching or duplicate socket subscriptions for the same data | Extra work on join |

Follow existing XState v5 + `socketActor` patterns; do not invent a new state layer for perf.

### 5. Growth lens (always apply)

For each finding, tag **When**:

- **Now** — plausible pain at &lt;100 concurrent in one room (join spike, chat burst, DJ queue ops, plugin storms)
- **Near** — likely if concurrent climbs to a few hundred or rooms overlap
- **Later** — multi-room / multi-instance / 1k+ concurrent; record but do not prioritize unless cheap

Default recommendation bias: fix **Now** and cheap **Near**; defer **Later** unless the fix is tiny or the code is being touched anyway.

## Finding severity

| Severity | Meaning |
|----------|---------|
| **P0** | Likely user-visible pain at current load, or unbounded growth that can wedge a show (event-loop block, Redis hot loop, payload explosion) |
| **P1** | Clear bottleneck on a hot path; fine today but unsafe at near-term growth or under burst (reactions, join stampede) |
| **P2** | Solid antipattern; fix when touching the area; impact mostly Later or rare paths |
| **P3** | Speculative / polish; measure first or defer freely |

## Output

### Inline summary (short)

1–3 sentences: overall performance verdict for the boundary (healthy at current
load / mixed / growth risk), naming the hottest path if any.

### Plan file

Save to `plans/review-performance-<kebab-area>.plan.md` (ask before overwrite).

**Cursor plan preview:** The file **must** use the `.plan.md` suffix and start
with YAML frontmatter (`name`, `overview`, `todos`, `isProject`). Without
that, Cursor opens it as plain markdown instead of the interactive plan UI.
Map each fix item `P#` to a frontmatter todo (`id: p1`, etc.). Use
`status: pending` initially; after opt-out, set kept → `pending` (or
`in-progress` / `completed` as work proceeds), dropped → omit or
`cancelled`, deferred → leave `pending` and note in the body.

```markdown
---
name: Performance review — <area>
overview: <one-line verdict / scope summary>
todos:
  - id: p1
    content: "P1 — <title>"
    status: pending
  - id: p2
    content: "P2 — <title>"
    status: pending
isProject: false
---

# Performance review: <area>

**Date:** YYYY-MM-DD
**Boundary:** <agreed scope>
**Scale lens:** current ≈ 1 room/month, &lt;100 concurrent; growth possible
**Verdict:** <one line>

## Findings

| ID | Sev | When | Title | Location | Failure mode |
|----|-----|------|-------|----------|--------------|
| F1 | P0 | Now | … | `path` / symbol | e.g. Redis ops × users |

## Fix plan (opt-out)

Each item is independent unless **Depends** says otherwise. Default: all
**Now**/**Near** P0–P1 included; P2–P3 and **Later** may be listed as
defer-friendly.

### P1 — <title>
- **Addresses:** F1, F2
- **When:** Now | Near | Later
- **Depends:** none | P#
- **Files:** …
- **Change:** 1–3 sentences, concrete
- **Done means:** verifiable outcome (incl. how to sanity-check under load if useful)
- **Risk:** one line

### P2 — …
…

## Measurement / validation notes
- What to watch (e.g. Redis command rate, payload size, join latency, FPS/jank)
- Or "none — fix is structural and low risk"

## Explicit non-actions
- … (reviewed, left as-is, with reason — especially premature opts)

## Opt-out checklist

Reply with decisions (keep is default for P0–P1 Now/Near):

- [ ] P1 — keep / drop / defer
- [ ] P2 — keep / drop / defer
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
- Findings cite real files/symbols and a concrete failure mode; **When**
  (Now/Near/Later) is set
- Plan saved as `*.plan.md` with Cursor frontmatter (`name`, `overview`,
  `todos`, `isProject`) plus opt-outable `P#` items and a checklist
- No code was changed unless the user explicitly approved implementation after opt-out
