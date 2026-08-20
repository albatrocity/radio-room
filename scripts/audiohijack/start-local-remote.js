// Start Listening Room DJ Mac (`local-remote`)
//
// Audio Hijack → Script Library → User Scripts → paste this file.
// Session → Scripting → New Automation → Session Start → run this script.
//
// Assumes the pack is installed at:
//   ~/Applications/listening-room-dj-mac/local-remote
//
// #needsSession

// Plain `nohup … &` is NOT enough: the child stays in Audio Hijack's process
// group and is often reaped when runShellCommand returns. The script then
// "succeeds" (status 0) but nothing listens on :9876. Detach with a Perl
// double-fork + setsid so the daemon is adopted by launchd.
//
// Audio Hijack's shell often has an empty $HOME, which would turn
// $HOME/Library/Logs/... into /Library/Logs/... (permission denied).

const cmd = [
  // Resolve real home — AH often leaves $HOME empty (→ /Library/Logs/…).
  'HOME="${HOME:-$(eval echo "~$(/usr/bin/id -un)")}"',
  'HOME="${HOME:-$(/usr/bin/python3 -c \'import pwd,os; print(pwd.getpwuid(os.getuid()).pw_dir)\')}"',
  'if [ -z "$HOME" ] || [ "$HOME" = "/" ]; then echo "could not resolve HOME" >&2; exit 1; fi',
  'export HOME',
  'PACK="$HOME/Applications/listening-room-dj-mac"',
  'BIN="$PACK/local-remote"',
  'LOG="$HOME/Library/Logs/listening-room-local-remote.log"',
  'mkdir -p "$(dirname "$LOG")" 2>/dev/null || true',
  'echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) AH start-local-remote invoked HOME=$HOME" >>"$LOG"',
  'if [ ! -x "$BIN" ]; then echo "missing executable: $BIN" | tee -a "$LOG" >&2; exit 1; fi',
  // Avoid matching the pgrep/pkill command line itself.
  'if pgrep -f "[l]istening-room-dj-mac/local-remote" >/dev/null 2>&1; then echo "local-remote already running" | tee -a "$LOG"; exit 0; fi',
  'PACK_ABS="$(cd "$PACK" && pwd)"',
  'BIN_ABS="$PACK_ABS/local-remote"',
  '/usr/bin/perl -MPOSIX -e \'my($b,$l,$c)=@ARGV; chdir $c or die $!; open STDOUT,">>",$l or die $!; open STDERR,">&STDOUT"; open STDIN,"<","/dev/null"; fork and exit; POSIX::setsid(); fork and exit; exec $b or die $!\' "$BIN_ABS" "$LOG" "$PACK_ABS"',
  'sleep 1',
  'if ! pgrep -f "[l]istening-room-dj-mac/local-remote" >/dev/null 2>&1; then echo "local-remote did not stay running after start (Gatekeeper? run: xattr -dr com.apple.quarantine \\"$PACK_ABS\\" then ./local-remote in Terminal)" | tee -a "$LOG" >&2; exit 1; fi',
  'echo "started local-remote (detached) HOME=$HOME"',
].join(" && ");

let [status, stdout, stderr] = app.runShellCommand(cmd);
let detail = (stderr || stdout || "").trim();

if (status !== 0) {
  console.error("start-local-remote failed (" + status + "): " + detail);
  console.dialog(
    "Could not start local-remote.\n" +
      (detail ? detail + "\n" : "") +
      "See Console.app or ~/Library/Logs/listening-room-local-remote.log"
  );
} else if (stdout) {
  console.log(stdout.trim());
}
