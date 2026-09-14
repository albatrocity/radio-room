/**
 * Flag constants for chat text-size effects (grow / shrink / echo).
 * Kept free of plugin-base imports so item modules can re-export them
 * without hitting ESM circular-export TDZ through `@repo/plugin-base`.
 */
export const GROW_FLAG = "grow"
export const SHRINK_FLAG = "shrink"
export const ECHO_FLAG = "echo"
