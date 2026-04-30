---
name: add-plugin-base
description: Adds a new room plugin package extending BasePlugin from @repo/plugin-base, wires it into the API server, and matches existing plugin layout. Use when creating a new plugin under packages/, when the user mentions BasePlugin, plugin registry, or examples like guess-the-tune, playlist-democracy, queue-hygiene, or absent-dj.
disable-model-invocation: true
---

# Add a new plugin (`@repo/plugin-base`)

## Before coding

1. Read [docs/PLUGIN_DEVELOPMENT.md](docs/PLUGIN_DEVELOPMENT.md) for the full plugin API (events, storage, components, queue validation, exports).
2. If the plugin listens to or emits system behavior, skim [docs/adrs/index.md](docs/adrs/index.md) for relevant ADRs (e.g. system events, emit-from-operations).

## Package layout

Create `packages/plugin-<kebab-name>/` (workspace `packages/*` picks it up automatically).

**Reference implementations** (copy structure, not necessarily every feature):

| Plugin | Use as example for |
|--------|-------------------|
| [packages/plugin-guess-the-tune](packages/plugin-guess-the-tune) | `augmentNowPlaying`, `emit`, `executeAction`, `augmentRoomExport`, `package.json` exports, optional `schema.ts` split |
| [packages/plugin-playlist-democracy](packages/plugin-playlist-democracy) | Reactions, timers, `getComponentSchema` / `getComponentState`, playlist augmentation |
| [packages/plugin-queue-hygiene](packages/plugin-queue-hygiene) | `validateQueue`, config-only admin UI, `onConfigChange` |
| [packages/plugin-absent-dj](packages/plugin-absent-dj) | Timers (`startTimer` / `clearTimer`), component state |

## `package.json`

- `name`: `@repo/plugin-<kebab-name>`
- `main` / `types`: `index.ts` (matches existing plugins)
- **dependencies**: `@repo/plugin-base`, `@repo/types` (add `@repo/utils` or others only if needed)
- **peerDependencies**: `"zod": "^4.x"` when using Zod in the package (align with other plugins)
- **devDependencies**: `@repo/eslint-config`, `@repo/typescript-config`, `vitest` if you add tests
- Optional **`exports`** map (see guess-the-tune) if consumers need subpaths like `./types`

## Core implementation

1. **`types.ts`**: Zod `*ConfigSchema`, `export type *Config = z.infer<typeof schema>`, `default*Config` object aligned with schema defaults.
2. **`index.ts`**:
   - `class MyPlugin extends BasePlugin<MyConfig>` with **`name`** equal to the stable plugin id (kebab-case, used for config keys and storage namespacing).
   - `version` from `./package.json` where other plugins do, or a fixed semver for simple plugins.
   - `static readonly configSchema` and `static readonly defaultConfig` on the class.
   - **`async register(context)`**: call `await super.register(context)` first, then `this.on("EVENT", handler)` for system events.
   - Export **`export function createMyPlugin(configOverrides?: Partial<MyConfig>): Plugin`** returning `new MyPlugin(configOverrides)`, and default export if the repo pattern uses it for the API.
3. **`schema.ts`** (optional but common): `getConfigSchema()` → `PluginConfigSchema` (`jsonSchema`, `layout`, `fieldMeta`, actions). `getComponentSchema()` only if the plugin has declarative UI.
4. **Tests** (optional): `index.test.ts` + `vitest` like `plugin-guess-the-tune`.

### BasePlugin reminders

- Use `this.on(...)` / `this.onConfigChange(...)`; use `this.context.storage` and `this.context.api` per docs.
- Use `this.emit` for frontend `PLUGIN:<name>:<event>` events when needed.
- Override `cleanup` behavior via `onCleanup` if you need extra teardown; storage cleanup is handled by the base class.

### Zod in workspaces

If TypeScript complains about incompatible Zod types across packages, the guess-the-tune pattern is: cast `configSchema as any` on `static readonly configSchema` (documented in that plugin as duplicate `z` instances under npm workspaces).

## Register the plugin in the API

1. **`apps/api/package.json`**: add `"@repo/plugin-<kebab-name>": "*"` to `dependencies`.
2. **`apps/api/src/server.ts`**:
   - `import createMyPlugin from "@repo/plugin-<kebab-name>"`
   - Append `createMyPlugin` to the `plugins: [ ... ]` array passed to `registerAdapters`.

Run `npm install` from the repo root so the workspace link resolves.

## Naming checklist

- Package directory and npm name: `@repo/plugin-<kebab-name>`.
- Class `name` field: same kebab string as used everywhere else for that plugin.
- Factory name: `create<StudlyPlugin>Plugin` matching existing imports in `server.ts`.

## Verify

- `npm test -w @repo/plugin-<kebab-name>` (if tests exist)
- `npm run lint` or package lint script
- Boot API locally and enable the plugin in a room to confirm registration

## Do not

- Add React inside plugin packages (UI is declarative component schema + web client).
- Skip `super.register(context)` in `register`.
- Register the plugin only in `packages/server` without also adding it to **`apps/api/src/server.ts`** — the API entry registers plugins for this app.
