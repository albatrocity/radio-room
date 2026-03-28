# 0017. Scheduling App for Show Programming

**Date:** 2026-03-27
**Status:** Accepted

## Context

The Listening Room platform needs a way for admins to plan and schedule shows and their segments before they go live in rooms. Shows are time-bound experiences composed of ordered segments (e.g., live performances, interviews, DJ sets). Admins need to create segments independently, organize them into shows, and eventually attach shows to rooms.

Key requirements:
- Admin-only access (no guest visibility)
- Segment management with status-driven workflow (Kanban)
- Show management with segment sequencing (timeline)
- Drag-and-drop for status changes and segment ordering
- Plugin preset storage on segments for future room integration
- Tagging system for organizing segments and shows

## Decision

### Separate Vite App

The scheduler is built as a standalone Vite app (`apps/scheduler/`) rather than routes within the existing web app. The scheduler is a supportive admin tool that may be abandoned. Keeping it in a separate app provides clean separation of concerns and makes it easy to remove without affecting the main web app.

### Shared API Server

The scheduling REST API (`/api/scheduling/*`) is added to the existing `@repo/server` package and mounted behind `requireAdmin` middleware. This avoids a second API server while sharing authentication, database connections, and middleware.

### TanStack Query + Form over XState

Unlike the web app which uses XState for managing real-time socket-driven state, the scheduler uses TanStack Query for server state (fetching, caching, mutations with optimistic updates) and TanStack Form for form management. This is a better fit for the CRUD-heavy, request-response nature of the scheduling app.

### Schema Design

- **PostgreSQL with Drizzle ORM** for persistent scheduling data, extending `@repo/db`
- **`pgEnum`** for show/segment status columns (DB-level validation)
- **Polymorphic tags** with a `type` discriminator column and separate junction tables per entity
- **JSONB** for plugin presets on segments (stores the full `PluginPreset` shape)
- **Junction table with position** (`show_segment.position`) for segment ordering within shows

### REST-First

No websockets for the scheduling app initially. Real-time collaboration can be added later if multiple admins need to edit concurrently.

## Consequences

**Positive:**
- Clean separation makes the scheduler disposable without affecting the web app
- Shared API server avoids infrastructure duplication for auth, DB, and middleware
- TanStack Query provides automatic caching, background refetching, and optimistic updates suited to CRUD
- Polymorphic tags are extensible to future entity types
- `dnd-kit` provides accessible drag-and-drop for both Kanban and timeline UIs

**Negative:**
- Separate app means duplicating Chakra UI provider setup (minimal -- ~15 lines)
- Admins must navigate to a different URL to access the scheduler
- No real-time sync between multiple admin sessions editing the same show
- Plugin preset storage as JSONB means no referential integrity on preset data
