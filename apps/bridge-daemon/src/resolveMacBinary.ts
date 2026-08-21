import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"

/** Directories GUI-launched processes typically lack vs a login-shell PATH. */
export const MAC_GUI_BIN_DIRS = ["/opt/homebrew/bin", "/usr/local/bin"] as const

export type ResolveMacBinaryDeps = {
  exists?: (path: string) => boolean
  which?: (bin: string) => string | undefined
}

function defaultWhich(bin: string): string | undefined {
  try {
    const result = execFileSync("which", [bin], { encoding: "utf8" }).trim()
    return result || undefined
  } catch {
    return undefined
  }
}

/**
 * Resolve a Homebrew/MacPorts-style binary when the process was started by
 * Audio Hijack or another GUI app (PATH is often `/usr/bin:/bin:/usr/sbin:/sbin`).
 */
export function resolveMacBinary(
  name: string,
  configured = name,
  deps: ResolveMacBinaryDeps = {},
): string {
  const exists = deps.exists ?? existsSync
  const which = deps.which ?? defaultWhich
  const trimmed = configured.trim() || name

  if (trimmed.includes("/") && exists(trimmed)) return trimmed

  for (const dir of MAC_GUI_BIN_DIRS) {
    const candidate = `${dir}/${name}`
    if (exists(candidate)) return candidate
  }

  const fromWhich = which(trimmed)
  if (fromWhich && exists(fromWhich)) return fromWhich

  return trimmed
}
