# 0202. Plugin registry package and generic settings state

**Date:** 2026-10-14
**Status:** Accepted

## Context

Adding a plugin that used existing templates and host methods still touched three places outside the plugin package:

- `apps/api/src/server.ts` imported every factory into the `registerAdapters` call.
- `modalsMachine` needed an `EDIT_*` event, a `settingsSectionOn` entry, a modal-region transition, and a `settings.*` child per plugin. Without them the Admin Settings link was a no-op, even though `AdminSettingsSurface` already rendered every plugin form from `GET /api/plugins`.
- studio-bridge served a hand-copied `stubPluginSchemas.ts` for the plugins Game Studio previews, which drifted from the packages and omitted admin config schemas.

Plugins stay compile-time imports ([ADR 0006](0006-plugin-system-for-room-features.md)). The goal is one list, not discovery.

## Decision

1. **`@repo/plugins` owns the factory list.** `packages/plugins/index.ts` exports `pluginFactories`, and the package depends on every `@repo/plugin-*`. The API passes the array to `registerAdapters`. studio-bridge imports it to build `GET /api/plugins`. A package, rather than `apps/api/src/plugins.ts`, keeps apps from depending on apps (studio-bridge would otherwise pull the API into its build graph). `plugin-base` cannot hold the list because every plugin depends on it.
2. **One `settings.plugin` state.** `modalsMachine` handles `{ type: "EDIT_PLUGIN_SETTINGS"; pluginName }` by entering `settings.plugin` and assigning `pluginSettingsName` in context. `AdminSettingsSurface` opens the `DynamicPluginSettings` whose name matches. Core sections (content, chat, dj, schedule, polls, feedback, and the rest) stay named states.
3. **Schema mapping is shared.** `toPluginSchemaInfo(plugin)` in `@repo/utils` builds a `PluginSchemaInfo`. Both `PluginRegistry.getPluginSchemas` and studio-bridge use it.
4. **Plugin packages are ESM.** `plugin-base` and every `plugin-*` declare `"type": "module"`. studio-bridge runs under Node's ESM loader, which cannot link named exports or default-export factories from CommonJS-typed TypeScript packages. The API bundles with esbuild and runs `tsx` in development, so it loads either format.
5. **studio-bridge forces `enabled: true`** on the plugins whose Room UI it simulates. Game Studio syncs config only for item-shops, and package defaults are `enabled: false`. Action stubs (quiz, lyric-hero, volume) remain hand-written, because the stub does not run plugins.

## Consequences

- A new plugin edits `packages/plugins/index.ts` and `packages/plugins/package.json`. No web or studio change is needed for admin settings or schemas.
- Plugins whose Room UI depends on simulated actions still need a studio stub. A new component template, a new `PluginContext` capability ([ADR 0201](0201-plugin-capability-interfaces.md)), or a plugin event handled by core UI ([ADR 0093](0093-client-socket-event-allowlists-and-shared-plugin-component-actors.md)) are still host changes.
- `toPluginSettingsEvent(name)` returns the event object. Typos in plugin names are no longer caught by the event union, but a wrong name only opens an empty settings section.
- studio-bridge imports every plugin at startup. If one starts touching the network or env on import, split a schema-only module for that package rather than reintroducing copied schemas.
- The Docker API image must be rebuilt after the dependency change, because `node_modules` lives in the image.

## See also

- [0006. Plugin system for room features](0006-plugin-system-for-room-features.md)
- [0051. Game Studio client sandbox](0051-game-studio-client-sandbox.md)
- [0201. Plugin capability interfaces](0201-plugin-capability-interfaces.md)
