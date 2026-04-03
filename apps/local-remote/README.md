# local-remote

Local daemon that connects to the **same Redis** as the Listening Room platform, subscribes to **`SYSTEM:*`** pub/sub channels, and sends **OSC (Open Sound Control)** over **UDP** when **`SEGMENT_ACTIVATED`** matches your room and segment map—useful for triggering tiles in [Farrago](https://rogueamoeba.com/support/manuals/farrago/?page=osc) or any OSC listener.

## Requirements

- [Rust](https://rustup.rs/) (stable), `cargo` on your `PATH`
- Network access to the remote Redis used by the platform
- For Farrago on the same Mac: enable **OSC Input** and note the **UDP port** (Settings → Controllers)

## Run

From the monorepo root:

```bash
npm run dev --workspace=local-remote
```

Or from this directory:

```bash
npm run dev
```

Open **http://127.0.0.1:9876/** (default). Set Redis URL, room filter, OSC host/port, and **segment id → OSC address** map, then **Save & apply** (Redis subscription reconnects without restarting the process).

Use **Pick segments (ready shows)** to load segment ids from the platform scheduling API instead of copying them by hand: set **Platform API URL** to your Listening Room API origin (default behavior uses `http://127.0.0.1:3000` when the field is empty), sign in as a **platform admin** in the scheduler in the **same browser**, then **Fetch ready shows**. See [Scheduling API (segment picker)](#scheduling-api-segment-picker) below.

> **Note:** Changing `httpListen` is written to config but only takes effect after you restart the app.

## Config file

Default path (first run creates it):

- **macOS:** `~/Library/Application Support/local-remote/config.json`
- **Linux:** `~/.config/local-remote/config.json`

JSON uses **camelCase** (e.g. `redisUrl`, `roomId`, `platformApiBaseUrl`, `features.osc.segmentMap`, `features.osc.defaultArgs`).

## Scheduling API (segment picker)

The embedded UI can call the platform **`GET /api/scheduling/shows?status=ready`** and **`GET /api/scheduling/shows/:id`** from the browser using **`fetch` with `credentials: "include"`**, reusing the same **Better Auth** session cookie as the scheduler app ([ADR 0016](../../docs/adrs/0016-better-auth-with-drizzle-for-platform-authentication.md)).

**Requirements:**

1. **Platform admin** — Listing ready shows is allowed only for users with the platform **admin** role (same as the scheduling app).
2. **Same API host as login** — Set **Platform API URL** to the exact origin where you authenticate (e.g. if you use `http://127.0.0.1:3000` in the scheduler’s API config, use that here too). Mixing `localhost` and `127.0.0.1` often breaks cookies.
3. **CORS** — The API allowlists local-remote’s default UI origins (`http://127.0.0.1:9876`, `http://localhost:9876`). If you change **HTTP listen**, set **`LOCAL_REMOTE_URL`** on the API server to that origin (comma-separated for multiple values). See [ADR 0027](../../docs/adrs/0027-local-remote-scheduling-ui-cors.md).

Segment rows added from the picker use **`segmentId`** from the show (the id emitted on **`SEGMENT_ACTIVATED`** in Redis), not the per-show join row id.

## Platform event contract

- Channels: `SYSTEM:{EVENT_NAME}` (e.g. `SYSTEM:SEGMENT_ACTIVATED`).
- Body: JSON only (no envelope); see [`packages/types/SystemEventTypes.ts`](../../packages/types/SystemEventTypes.ts).
- `SEGMENT_ACTIVATED` payload uses **camelCase** keys (`roomId`, `segmentId`, …).

Filter by **room**: set `roomId` in the UI. Leave it **empty** to accept all rooms.

## OSC mapping (Farrago example)

1. In Farrago, enable **OSC Input** and choose a **port** (e.g. `8000`).
2. In local-remote, set **OSC host** to `127.0.0.1` and **port** to the same value.
3. Map each **segment id** (string, as emitted in Redis) to a **full OSC path** starting with `/`, e.g. `/set/selected/tile/0/0/play`. See [Farrago OSC manual](https://rogueamoeba.com/support/manuals/farrago/?page=osc) for addresses.
4. Optional **default arguments**: comma-separated floats (e.g. `1` or `1.0`) appended as OSC float32 arguments on every send if the target expects a value.

**v1** only reacts to **`SEGMENT_ACTIVATED`**. Other `SYSTEM:*` events are ignored for OSC (extensible later).

## OSC connection test

Use the **Test OSC to Farrago** button (`/ping`) or each mapping row’s **Test** button to send that row’s path with the same **default args** as live `SEGMENT_ACTIVATED` sends. Or call `POST /api/osc-test` with JSON (defaults shown):

```bash
curl -s -X POST http://127.0.0.1:9876/api/osc-test \
  -H 'Content-Type: application/json' \
  -d '{"host":"127.0.0.1","port":8000,"address":"/ping","waitForReply":true,"replyTimeoutMs":500}'
```

Example tile path with float args:

```bash
curl -s -X POST http://127.0.0.1:9876/api/osc-test \
  -H 'Content-Type: application/json' \
  -d '{"host":"127.0.0.1","port":8000,"address":"/set/selected/tile/0/0/play","args":[1.0],"waitForReply":true,"replyTimeoutMs":500}'
```

- **`address`** defaults to `/ping` ([Farrago documents](https://rogueamoeba.com/support/manuals/farrago/?page=osc) replies to ping for controller sync).
- **`waitForReply`**: if true, waits for any UDP packet **on the same ephemeral socket**. **Farrago usually will not reply there**: it pushes OSC to the **OSC Output** destination in Settings, not back to the sender. So `replyReceived: false` is **normal** even when Farrago received the message. **`bytesSent` > 0** means your machine successfully sent UDP to that host:port.
- **Same Mac as Farrago:** prefer host **`127.0.0.1`** (the LAN IP in Farrago’s dialog is mainly “where to aim from other devices”).
- **Tiles not firing:** Farrago’s manual uses a **value** with addresses like `/set/selected/tile/0/0/select`—set **default args** to `1` or `1.0` for your `/play` or `/select` path. Confirm grid indices match your board.

## Build release binary

```bash
npm run build --workspace=local-remote
# output: dist/local-remote (macOS/Linux; on Windows use dist/local-remote.exe and adjust the `cp` line in package.json if needed)
```

Workspace npm scripts pass **`--target-dir daemon/target`** so outputs land under `apps/local-remote/daemon/target/` even when `CARGO_TARGET_DIR` is set globally.

## Manual test (Redis CLI)

With the daemon running, OSC enabled, `roomId` / `segmentMap` / port configured:

```bash
redis-cli -u "$REDIS_URL" PUBLISH 'SYSTEM:SEGMENT_ACTIVATED' \
  '{"roomId":"YOUR_ROOM","showId":"s","segmentId":"4","segmentTitle":"Test"}'
```

## Run in the background (macOS `launchd`)

Example `~/Library/LaunchAgents/com.listeningroom.local-remote.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.listeningroom.local-remote</string>
  <key>ProgramArguments</key>
  <array>
    <string>/ABS/PATH/TO/repo/apps/local-remote/dist/local-remote</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/local-remote.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/local-remote.err</string>
</dict>
</plist>
```

Then:

```bash
launchctl load ~/Library/LaunchAgents/com.listeningroom.local-remote.plist
```

Adjust the binary path after `npm run build --workspace=local-remote`.

## Logging

Set `RUST_LOG` (e.g. `RUST_LOG=local_remote=debug,info`).
