import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/**
 * Opens a macOS file chooser for a Navidrome database and returns its POSIX
 * path. Cancelled choosers resolve to `{ cancelled: true }` (ADR 0230).
 */
export async function browseNavidromeDbPath(): Promise<
  { path: string } | { cancelled: true }
> {
  if (process.platform !== "darwin") {
    throw new Error("File chooser is only available on macOS; paste the path instead")
  }
  const script = `
    set chosen to choose file with prompt "Choose a Navidrome database" of type {"db", "sqlite", "sqlite3", "public.database"} without invisibles
    return POSIX path of chosen
  `
  try {
    const { stdout } = await execFileAsync("osascript", ["-e", script], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    })
    const path = stdout.trim()
    if (!path) return { cancelled: true }
    return { path }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    // User hit Cancel: osascript exits non-zero with "User canceled."
    if (/user canceled|user cancelled/i.test(message)) {
      return { cancelled: true }
    }
    throw error instanceof Error ? error : new Error(message)
  }
}
