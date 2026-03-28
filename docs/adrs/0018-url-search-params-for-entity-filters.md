# 0018. URL Search Params for Entity Filters (Scheduler)

**Date:** 2026-03-28  
**Status:** Accepted

## Context

The scheduling app lists entities (shows, segments) with search and filter controls. Storing that state only in React component state makes URLs opaque: users cannot bookmark or share a filtered view, refresh loses filters, and the browser history does not reflect filter changes.

## Decision

In the **scheduler app** (`apps/scheduler`), all **entity list / search / filter** state MUST be represented in the URL as search query parameters, not in local component state (e.g. `useState` for filters).

Implementation conventions:

- Define search shape per route with TanStack Router `validateSearch`, using a schema (e.g. Zod via `@tanstack/router-zod-adapter`).
- Read filters with `Route.useSearch()` or `getRouteApi(...).useSearch()`.
- Update filters with `navigate({ search: ... })` or `<Link search={...} />`.
- For segment-browser filters on show detail, use a clear prefix (e.g. `segSearch`, `segTags`) so future show-level search params do not collide.

Modal open state, drag-overlay state, and form field state while typing may remain local; only **list/filter/search** that drives server queries belongs in the URL.

The main web app (`apps/web`) is not required to adopt this pattern immediately but may align over time.

## Consequences

**Positive**

- Shareable and bookmarkable filtered views.
- Back/forward navigation restores prior filters.
- Refresh preserves filter state.
- Easier debugging (URL is the source of truth for “what list am I looking at?”).

**Negative**

- Slightly more boilerplate per route (`validateSearch`, navigation on filter change).
- Array and boolean query params need careful schema handling (serialization, optional keys).
- Very large filter payloads are a poor fit for URLs (not an issue for current scheduler filters).
