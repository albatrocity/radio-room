---
name: adrs
description: Reviews architectural decision records before features and refactors; creates or supersedes ADRs when making structural choices. Use before implementing features or refactors, when choosing patterns, libraries, or integration approaches, when adding handlers/events/plugins, or when the user mentions ADRs, docs/adrs, or architectural decisions.
---

# Architectural Decision Records

ADRs record **why** the codebase is shaped the way it is. Treat Accepted ADRs as constraints unless you are explicitly superseding them with user approval.

## Find ADRs in this repo

1. Default path: `docs/adrs/index.md`.
2. If missing: search `CLAUDE.md`, `AGENTS.md`, `README.md` for `docs/adrs` or "Architectural Decision"; ask once if still unclear.
3. Never invent ADR numbers or paths from another project.

## Policy

Before implementing any feature or refactor, review the relevant ADRs in [`docs/adrs/`](docs/adrs/index.md).

1. **Review before implementing**: Read the [ADR index](docs/adrs/index.md) and any ADRs related to the area you are working in. Your implementation must align with these decisions.
2. **Create new ADRs**: When you make an architectural decision during development (choosing a pattern, data structure, library, or integration approach), create a new ADR in `docs/adrs/` using the next available number and the template from the index. Update the index table.
3. **Propose superseding**: To change an existing decision, create a new ADR and update the old one's status to "Superseded by [NNNN]".

## When this skill applies

Apply on:

- New features, refactors, or cross-cutting changes (auth, events, persistence, plugins, public APIs).
- Choosing libraries, patterns, folder layout, or integration shape.
- Adding transport handlers, domain events, or shared infrastructure.

Skip ADR **files** (still follow Accepted ADRs) for:

- Bug fixes that restore intended behavior.
- Copy, styling, or tests that do not change architecture.
- Mechanical renames/formatting with no design change.

If unsure whether a choice is architectural, **bias toward writing an ADR** or ask once.

## Review workflow (before coding)

Complete before editing production code:

```
ADR review:
- [ ] Open docs/adrs/index.md
- [ ] Scan index for titles/statuses matching the work area
- [ ] Read full text of each relevant Accepted (or Partially superseded) ADR
- [ ] Note constraints to honor in the implementation plan
- [ ] Flag conflicts: plan contradicts an Accepted ADR → stop or propose supersede
```

**Finding relevant ADRs:**

| Signal | Action |
|--------|--------|
| Index title matches area (events, auth, plugins, queue, …) | Read that ADR |
| Repo has `AGENTS.md` / `CLAUDE.md` with ADR examples for an area | Read those linked ADRs first |
| Touching code cited inside an ADR | Read that ADR |
| Grep `docs/adrs/` for keywords (e.g. `Socket`, `plugin`, `Redis`, `OAuth`) | Read hits |

Do not read all ADRs every time — use the index as a map.

**Statuses:**

| Status | Meaning for implementation |
|--------|----------------------------|
| Accepted | Must align |
| Proposed | Do not treat as binding until Accepted; may implement only if user directs |
| Partially superseded by [NNNN] | Read **both** old and new ADR; follow the new decision where it explicitly replaces the old |
| Superseded by [NNNN] | Historical context only; follow [NNNN] |
| Deprecated | Avoid new work that depends on it |

## Align implementation

- Prefer patterns **named in ADRs** (layering, event emission site, naming conventions) over inventing parallel approaches.
- If the task **requires** violating an Accepted ADR, do not silently diverge: surface the conflict and either (a) adjust the approach, or (b) start a superseding ADR with user approval.
- When ADRs reference concrete paths/symbols, verify they still exist; ADRs can drift — note drift to the user, do not ignore the decision intent.

## When to create a new ADR

Create when the change introduces or locks in:

- A new **pattern** others should copy (e.g. "events only from operations layer").
- A new **dependency** (library, datastore, external service).
- A **boundary** (which layer owns what; what clients may see).
- **Irreversible or expensive** structure (data model, wire protocol, plugin API).
- A **trade-off** future contributors must understand.

Do **not** create an ADR for:

- One-off implementation detail with no reuse.
- Decisions already fully covered by an existing Accepted ADR (link instead).

## Create workflow

1. Read `docs/adrs/index.md` — confirm next `NNNN` (max existing + 1, zero-padded to 4 digits).
2. Create `docs/adrs/NNNN-short-kebab-title.md`.
3. Fill sections (quality bar below).
4. Add row to index table: number, linked title, status (usually `Accepted` if implementing now; `Proposed` if design-only).
5. In PR/summary, mention new ADR number and one-line decision.

**Embedded template** (use if index has no template block):

```markdown
# NNNN. Title

**Date:** YYYY-MM-DD
**Status:** Accepted | Proposed | Deprecated | Superseded by [NNNN]

## Context

Why this decision was needed. Constraints, prior pain, alternatives considered.

## Decision

What was decided. Be specific: layers, file areas, naming, libraries, invariants.

## Consequences

Positive and negative outcomes. What becomes easier/harder. Follow-up work if any.
```

**Writing quality:**

- **Context**: problem and forces, not a ticket dump.
- **Decision**: one clear choice; use bullets for rules engineers can grep.
- **Consequences**: include at least one trade-off.
- Optional **See also** links to code paths or other ADRs — use repo-relative paths.

## Supersede workflow

To **change** an Accepted decision:

1. Write new ADR `MMMM` with full Context/Decision/Consequences explaining the change.
2. Set new ADR status to `Accepted` (when the new approach is what you're implementing).
3. Update **old** ADR status to `Superseded by [MMMM]` (keep file; do not delete history).
4. Update index rows for both.
5. Implement against **MMMM**, not the old text.

For partial replacement, use status `Partially superseded by [MMMM]` on the old ADR and state in **MMMM** which parts remain valid.

Never edit an old Accepted ADR in place to mean something new — that breaks history.

## During implementation

- Re-check ADRs if the approach **pivots** mid-task.
- If you discover an undocumented architectural choice already merged in code, either document it in a retroactive ADR or align code to an existing ADR — do not leave silent precedent.
- Cross-link new ADRs from related ADRs' "See also" when it aids discovery (optional).

## Done means (ADR-related tasks)

- Relevant Accepted ADRs read and honored, **or** supersede path agreed with user.
- New architectural choices have `docs/adrs/NNNN-*.md` + index row.
- Superseded ADRs have updated status line and index status.
- User-facing summary cites ADR numbers touched.

## Bootstrap a repo without ADRs

If the project has no `docs/adrs/` yet and the user wants ADRs:

1. Create `docs/adrs/index.md` with title, short intro, empty index table, and the template from **Create workflow** above.
2. Optionally add a brief ADR pointer in `CLAUDE.md` or `AGENTS.md` (only if user asks).
3. First real ADR should capture the **ADR process itself** or the first major pattern being introduced.
