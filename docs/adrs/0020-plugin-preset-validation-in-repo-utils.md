# 0020. Plugin Preset Validation in `@repo/utils`

**Date:** 2026-03-28  
**Status:** Accepted

## Context

Plugin configuration **presets** are shared JSON documents ([`PluginPreset`](packages/types/PluginPreset.ts): `presetName`, `exportedAt`, `version`, `pluginConfigs`). Room admins export/import them in **`apps/web`**. The scheduling app needs the **same validation** when attaching a preset to a **segment**, without importing from `apps/web` (wrong dependency direction for a monorepo app-to-app dependency).

## Decision

1. **`validatePreset`** (and any small, pure helpers needed for preset shape checks) lives in **`@repo/utils`**, exported from the package’s public API.

2. **`@repo/types`** remains the canonical **type** definitions (`PluginPreset`, `PresetValidationResult`).

3. **Consumers:**
   - **`apps/web`** — [`pluginPresets.ts`](apps/web/src/lib/pluginPresets.ts) imports `validatePreset` from `@repo/utils` for file import; browser-only helpers (`exportPreset`, `importPreset`) stay in `apps/web`.
   - **`apps/scheduler`** — segment create/edit UI uses `validatePreset` from `@repo/utils` before persisting `pluginPreset` via the existing scheduling API.

4. **Contract:** Exported preset JSON from room admin and pasted/uploaded JSON in the scheduler MUST pass the same validator so stored segment presets remain interoperable with room import flows later.

## Consequences

**Positive**

- Single implementation of validation; web and scheduler cannot silently diverge on what counts as a valid preset.
- Scheduler depends only on shared packages (`@repo/utils`, `@repo/types`), not on `apps/web`.

**Negative**

- Moving validation out of `apps/web` requires a one-time refactor of `pluginPresets.ts` imports.
- Changes to the preset schema require updating types, validator, and any consumer UX in step.
