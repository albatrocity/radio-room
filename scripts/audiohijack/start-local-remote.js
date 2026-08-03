// Start Listening Room DJ Mac (`local-remote`)
//
// Audio Hijack → Script Library → User Scripts → paste this file.
// Session → Scripting → New Automation → Session Start → run this script.
//
// Assumes the pack is installed at:
//   ~/Applications/listening-room-dj-mac/local-remote
//
// #needsSession

const cmd = [
  'PACK="$HOME/Applications/listening-room-dj-mac"',
  'BIN="$PACK/local-remote"',
  'LOG="$HOME/Library/Logs/listening-room-local-remote.log"',
  'if [ ! -x "$BIN" ]; then echo "missing executable: $BIN" >&2; exit 1; fi',
  // Avoid matching the pgrep/pkill command line itself.
  'if pgrep -f "[l]istening-room-dj-mac/local-remote" >/dev/null 2>&1; then echo "local-remote already running"; exit 0; fi',
  'cd "$PACK" || exit 1',
  // Background: app.runShellCommand blocks Audio Hijack's main thread.
  'nohup "$BIN" >>"$LOG" 2>&1 &',
  'echo "started local-remote pid $!"',
].join(" && ");

let [status, stdout, stderr] = app.runShellCommand(cmd);

if (status !== 0) {
  console.error("start-local-remote failed (" + status + "): " + (stderr || stdout));
  console.dialog("Could not start local-remote.\nSee Console.app or ~/Library/Logs/listening-room-local-remote.log");
} else if (stdout) {
  console.log(stdout.trim());
}
