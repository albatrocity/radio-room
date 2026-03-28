# 0019. Pin React 18 Type Packages Monorepo-Wide

**Date:** 2026-03-28  
**Status:** Accepted

## Context

The monorepo runs **React 18** (`react` / `react-dom` ^18.2) in client apps, but some workspaces declared **`@types/react-dom` ^19** (or allowed npm to hoist **`@types/react` 19.x**). React 19’s `ReactNode` type includes **`bigint`**, which is incompatible with React 18’s typings. That mismatch surfaces as TS2786 (“cannot be used as a JSX component”) when using Chakra UI v3 and other libraries whose types assume a single `ReactNode` definition.

We want **stable builds and editor diagnostics** without a large React 19 migration right now.

## Decision

1. **Pin** `@types/react` and `@types/react-dom` to **React 18–aligned versions** everywhere we control dependencies:
   - `@types/react`: **18.3.18**
   - `@types/react-dom`: **18.3.5**

2. Declare them at the **root** (`listening-room` package) as **devDependencies** and enforce the same versions via npm **`overrides`**, so nested dependencies cannot pull `@types/react` 19.x into the hoisted tree.

3. **Apps** (`apps/web`, `apps/scheduler`, and any future React apps) MUST list matching devDependency versions (same pins) so local `tsc` and IDE resolution stay aligned with the root lockfile.

**Runtime** remains React 18; this ADR is about **TypeScript type packages** only.

## Consequences

**Positive**

- One `ReactNode` definition across the monorepo; Chakra and other JSX libraries type-check consistently.
- No immediate need to adopt React 19 breaking changes or re-test the whole UI stack.

**Negative**

- We **do not** get React 19 type refinements or typings that assume React 19-only APIs.
- **`overrides` + lockfile** must be kept honest: adding a package that insists on `@types/react` 19 could require revisiting this decision.

## Revisit

This is a **stability trade-off**, not a long-term platform choice. **Revisit soon** (e.g. when upgrading to **React 19** on purpose, or when maintenance cost of overrides exceeds a coordinated bump): remove pins, align `react` / `react-dom` / `@types/*` to 19, run full regression on `apps/web` and `apps/scheduler`, and supersede this ADR with a React 19 migration record.
