# Claude Agent Guidelines

This file provides instructions for Claude Code and Claude-based agents working in the Listening Room codebase. For full project context, structure, and common tasks, see [AGENTS.md](AGENTS.md).

## Architectural Decision Records

Before implementing any feature or refactor, review the relevant ADRs in [`docs/adrs/`](docs/adrs/index.md).

1. **Review before implementing**: Read the [ADR index](docs/adrs/index.md) and any ADRs related to the area you are working in. Your implementation must align with these decisions.
2. **Create new ADRs**: When you make an architectural decision during development (choosing a pattern, data structure, library, or integration approach), create a new ADR in `docs/adrs/` using the next available number and the template from the index. Update the index table.
3. **Propose superseding**: To change an existing decision, create a new ADR and update the old one's status to "Superseded by [NNNN]".

## Key References

- [AGENTS.md](AGENTS.md) -- Full project structure, patterns, common tasks, and code style
- [docs/adrs/](docs/adrs/index.md) -- Architectural Decision Records
- [docs/BACKEND_DEVELOPMENT.md](docs/BACKEND_DEVELOPMENT.md) -- Server architecture
- [docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md) -- Plugin system
