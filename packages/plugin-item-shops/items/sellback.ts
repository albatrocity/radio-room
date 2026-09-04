/**
 * Studio-bridge / Game Studio entry point for per-item sellback quotes.
 * Re-exports the registry built from item modules in `./index` so a new
 * `sellbackValue` on `createItem` shows up here with no extra package.json
 * export. Does not import the plugin class or `@repo/server`.
 */
export { ITEM_SELLBACK_VALUE_BEHAVIORS } from "./index"
