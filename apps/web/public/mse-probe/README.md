# Media Source Extensions radio probe

Disposable experiment. Answers four abort questions before building the real MSE
transport (see [MMS_RADIO_TRANSPORT_PLAN.md](../../../docs/MMS_RADIO_TRANSPORT_PLAN.md)):

1. Does `MediaSource.isTypeSupported("audio/mpeg")` return true on iPhone Safari?
2. Does appending raw MP3 produce audible playback?
3. Does MSE-backed playback survive a screen lock on iPhone?
4. Does the Now Playing card still work when the source is a `MediaSource`?

Delete this whole folder once Phase 0 is complete and results are recorded.

## Why it is a separate page

The probe deliberately does not touch `radioPlaybackElement` or the radio machine.
Isolating it means a failure here cannot break the real player.

## Running it

The page needs a secure context for `MediaSource` and lock-screen testing. Plain
`http://ross.local:8000` will not do on a phone — only `localhost` is exempt from
the HTTPS requirement, and a phone cannot use it.

### Option A: deploy (simplest)

The probe is in `public/`, so it ships with a normal build. Deploy, then open
`https://<your-host>/mse-probe/index.html` on the phone.

Always request `index.html` explicitly. The bare directory URL falls through to the
app's SPA fallback and renders the router's "NOT FOUND" page instead.

### Option B: local HTTPS with mkcert

```bash
# once: install the local CA
mkcert -install

# generate a pair for whatever host the phone will use
cd apps/web
mkcert ross.local 192.168.1.x localhost

# run the dev server over TLS
VITE_HTTPS_KEY=./ross.local+2-key.pem \
VITE_HTTPS_CERT=./ross.local+2.pem \
npm run dev
```

Install the mkcert root CA on the phone (Settings → General → VPN & Device
Management → install profile, then Certificate Trust Settings → enable full trust).

Open `https://ross.local:8000/mse-probe/index.html` on the phone.

## Test protocol

Run on each target browser. Do not attach Safari Web Inspector during the lock
test — a connected debugger keeps the page alive and masks the suspension being
measured. Everything needed is rendered on the page.

1. Open the page. Read the **Capabilities** section — note constructor and type
   support before pressing Play.
2. Enter a CORS-enabled MP3 stream URL (default is an RCAST station). Press **Play**.
3. Confirm audio and watch the log for `sourceopen`, first append, and `playing`.
4. Lock the phone for ~2 minutes with audio playing. Unlock and read the **Lock verdict**.
5. Check the lock screen **Now Playing card** for title, artist, and artwork while
   playing (physical device only — the iOS Simulator cannot validate artwork).
6. Press **Copy results** and paste the summary into your Phase 0 notes.

## Reading the result

| Observation | Meaning |
| --- | --- |
| `audio/mpeg` unsupported on iPhone | Abort — transmuxing to fMP4 would be required |
| `isTypeSupported` true but no audio | Abort — raw MP3 append does not work despite the API |
| Lock verdict `STOPPED` | Abort — MSE does not survive backgrounding on iOS |
| Now Playing card missing or no artwork | Note it — may block shipping MSE on iOS |
| `endstreaming` gaps in log | Expected on ManagedMediaSource; Phase 1 must handle these |

Artwork cannot be verified in the iOS Simulator ([WebKit 247043](https://bugs.webkit.org/show_bug.cgi?id=247043)).
Test lock-screen artwork on a physical device only.
