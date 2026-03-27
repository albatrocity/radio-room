# 0001. Monorepo with Turborepo and npm Workspaces

**Date:** 2025-01-01
**Status:** Accepted

## Context

The Listening Room application consists of multiple interconnected packages: a server core, shared types, media/metadata adapters, room plugins, test factories, a web frontend, and an API entry point. These packages share types, utilities, and conventions, and need to stay in sync during development. Managing them as separate repositories would create friction around versioning, cross-package changes, and local development setup.

## Decision

Use a **monorepo** managed by **Turborepo** with **npm workspaces**.

- All apps live under `apps/` (api, web, load-tester).
- All shared packages live under `packages/` (server, types, adapters, plugins, factories, utils, configs).
- Internal packages use the `@repo/` scope prefix (e.g., `@repo/server`, `@repo/types`).
- Turborepo orchestrates `build`, `dev`, `test`, `lint`, and `format` tasks with dependency-aware caching and parallelism.
- The `dev` task is marked `persistent: true` with `cache: false` in `turbo.json`.
- `build` tasks declare `^build` dependencies so packages build in topological order.

## Consequences

- **Atomic cross-package changes**: A single commit can update types, server logic, and the web client together.
- **Shared tooling**: ESLint config, TypeScript config, and Prettier are shared across all packages.
- **Fast iteration**: Turborepo caches build artifacts and skips unchanged packages.
- **Single `npm install`**: All dependencies resolve from the workspace root.
- **Trade-off**: The repository is larger and CI must account for the full workspace. Turborepo's filtering (`--filter`) mitigates this.
- **Naming convention**: The `@repo/` prefix signals internal-only packages that are not published to npm.
