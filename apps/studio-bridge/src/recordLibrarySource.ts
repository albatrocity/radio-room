import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { navidromeConfig } from "./recordSourceCredentials.js"
import { NavidromeLibraryFile } from "./navidromeLibraryFile.js"

/**
 * Which Navidrome catalog Game Studio's record routes use (ADR 0230):
 * live Subsonic, or a read-only `navidrome.db` pointer.
 */

export type RecordLibraryMode = "live" | "file"

export type RecordLibrarySourceState = {
  mode: RecordLibraryMode
  /** Remembered file path; kept when switching back to live. */
  path: string | null
}

export type RecordLibrarySourceStatus = RecordLibrarySourceState & {
  ok: boolean
  albumCount?: number
  error?: string
}

export const STUDIO_LIBRARY_CONFIG_PATH = join(
  homedir(),
  ".config",
  "listening-room-bridge",
  "studio-library.json",
)

let state: RecordLibrarySourceState = { mode: "live", path: null }
let openFile: NavidromeLibraryFile | null = null
let loaded = false

function readPersisted(configPath: string): RecordLibrarySourceState {
  try {
    const raw = JSON.parse(readFileSync(configPath, "utf8")) as {
      mode?: string
      path?: string | null
    }
    const mode: RecordLibraryMode = raw.mode === "file" ? "file" : "live"
    const path = typeof raw.path === "string" && raw.path.trim() ? raw.path.trim() : null
    return { mode, path }
  } catch {
    return { mode: "live", path: null }
  }
}

function writePersisted(configPath: string, next: RecordLibrarySourceState): void {
  mkdirSync(dirname(configPath), { recursive: true })
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`, "utf8")
}

function closeOpenFile(): void {
  if (!openFile) return
  try {
    openFile.close()
  } catch {
    /* ignore */
  }
  openFile = null
}

function ensureLoaded(configPath: string = STUDIO_LIBRARY_CONFIG_PATH): void {
  if (loaded) return
  loaded = true
  state = readPersisted(configPath)
  if (state.mode === "file" && state.path) {
    try {
      openFile = NavidromeLibraryFile.open(state.path)
    } catch (error) {
      // Keep the remembered path; status will report the error until the designer fixes it.
      openFile = null
      void error
    }
  }
}

/** Reset in-memory state (tests). */
export function resetRecordLibrarySourceForTests(): void {
  closeOpenFile()
  state = { mode: "live", path: null }
  loaded = false
}

export function getRecordLibrarySourceState(
  configPath: string = STUDIO_LIBRARY_CONFIG_PATH,
): RecordLibrarySourceState {
  ensureLoaded(configPath)
  return { ...state }
}

export function getOpenNavidromeLibraryFile(
  configPath: string = STUDIO_LIBRARY_CONFIG_PATH,
): NavidromeLibraryFile | null {
  ensureLoaded(configPath)
  return state.mode === "file" ? openFile : null
}

export function isFileLibraryMode(configPath: string = STUDIO_LIBRARY_CONFIG_PATH): boolean {
  ensureLoaded(configPath)
  return state.mode === "file"
}

export function getRecordLibrarySourceStatus(
  configPath: string = STUDIO_LIBRARY_CONFIG_PATH,
): RecordLibrarySourceStatus {
  ensureLoaded(configPath)
  if (state.mode === "live") {
    const live = navidromeConfig()
    if (!live) {
      return {
        ...state,
        ok: false,
        error:
          "Set up the Media Bridge daemon's Navidrome login, or NAVIDROME_URL/USER/PASSWORD",
      }
    }
    return { ...state, ok: true }
  }
  if (!state.path) {
    return { ...state, ok: false, error: "Choose a navidrome.db file" }
  }
  if (!openFile) {
    if (!existsSync(state.path)) {
      return { ...state, ok: false, error: `Database not found: ${state.path}` }
    }
    try {
      openFile = NavidromeLibraryFile.open(state.path)
    } catch (error) {
      return {
        ...state,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }
  try {
    return { ...state, ok: true, albumCount: openFile.albumCount() }
  } catch (error) {
    return {
      ...state,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

/**
 * Switch source. On failure, leaves the previous source in place and throws.
 */
export function setRecordLibrarySource(
  next: { mode: RecordLibraryMode; path?: string | null },
  configPath: string = STUDIO_LIBRARY_CONFIG_PATH,
): RecordLibrarySourceStatus {
  ensureLoaded(configPath)
  const previous = { state, openFile }

  if (next.mode === "live") {
    closeOpenFile()
    state = {
      mode: "live",
      path: next.path !== undefined ? (next.path?.trim() || null) : state.path,
    }
    writePersisted(configPath, state)
    return getRecordLibrarySourceStatus(configPath)
  }

  const path = (next.path ?? state.path)?.trim() || null
  if (!path) {
    throw new Error("Choose a navidrome.db file")
  }

  let candidate: NavidromeLibraryFile
  try {
    candidate = NavidromeLibraryFile.open(path)
  } catch (error) {
    // Leave previous source untouched.
    state = previous.state
    openFile = previous.openFile
    throw error instanceof Error ? error : new Error(String(error))
  }

  closeOpenFile()
  openFile = candidate
  state = { mode: "file", path }
  writePersisted(configPath, state)
  return getRecordLibrarySourceStatus(configPath)
}
