// Quit Listening Room DJ Mac (`local-remote`)
//
// Audio Hijack → Script Library → User Scripts → paste this file.
// Session → Scripting → New Automation → Session End → run this script.
//
// Sends SIGINT so local-remote can gracefully stop its supervised
// Media Bridge child (same as Ctrl-C).
//
// Assumes the pack is installed at:
//   ~/Applications/listening-room-dj-mac/local-remote
//
// #needsSession

const cmd = [
  // No match is fine (already stopped).
  'pkill -INT -f "[l]istening-room-dj-mac/local-remote" || true',
  'echo "sent SIGINT to local-remote (if running)"',
].join(" && ");

let [status, stdout, stderr] = app.runShellCommand(cmd);

if (status !== 0) {
  console.error("quit-local-remote failed (" + status + "): " + (stderr || stdout));
} else if (stdout) {
  console.log(stdout.trim());
}
