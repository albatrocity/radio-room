# Service worker lock-screen probe

Disposable experiment. Answers one question:

> On iOS, does audio keep playing while the screen is locked when the stream bytes are
> pumped through service worker JavaScript, instead of being fetched by the media element
> directly?

This matters because a service worker sitting in front of the stream is the only remaining
way to feed the oscilloscope on iOS Safari: the worker can tee the stream, decode one branch
for visualisation, and pass the other through to the `<audio>` element untouched. That only
works if it does not cost us lock-screen playback, which is the more important feature.

Delete this whole folder once the question is answered.

## Why it is a separate page

The probe deliberately does not touch `radioPlaybackElement` or the radio machine. Isolating
it means the only variable is the worker, and a failure here cannot break the real player.

The worker lives at `/sw-lock-probe/sw.js`, so its registration scope is `/sw-lock-probe/`
and it can never intercept an app request.

## Running it

The page needs a secure context. Plain `http://ross.local:8000` will not do — `localhost` is
the only http origin browsers treat as secure, and a phone cannot use it.

### Option A: deploy (simplest)

The probe is in `public/`, so it ships with a normal build. Deploy, then open
`https://<your-host>/sw-lock-probe/index.html` on the phone. Real certificate, no setup.

Always request `index.html` explicitly. The bare directory URL falls through to the app's
SPA fallback and renders the router's "NOT FOUND" page instead.

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

Then install the mkcert root CA on the phone, otherwise Safari rejects the certificate and
the service worker will not register:

1. `mkcert -CAROOT` prints the folder holding `rootCA.pem`
2. AirDrop or email `rootCA.pem` to the phone and open it
3. Settings → General → VPN & Device Management → install the profile
4. Settings → General → About → Certificate Trust Settings → enable full trust for it

Open `https://ross.local:8000/sw-lock-probe/index.html` on the phone.

## The three modes

| Mode | What the worker does | What it isolates |
| --- | --- | --- |
| Direct | Nothing, the element fetches the station itself | Control. Proves the device and network are not the problem. |
| Worker pass-through | Returns the fetched `Response` unmodified | Whether WebKit will play media served by a service worker at all. |
| Worker teed | Rebuilds the body from a JS `TransformStream` | Whether WebKit will play a body constructed in JavaScript. |

The pass-through and teed split exists because Chromium accepts both while WebKit is far
pickier about JS-constructed response bodies. Teeing is the entire point of the exercise — it
is what would let the worker decode a branch for the oscilloscope — so if only pass-through
works, the plan is dead regardless of what the lock screen does.

## Test protocol

Run the control first. Without it a failure is ambiguous — it could be the network, the
station, or power settings rather than the worker.

1. Open the page. Wait for status `Worker saw request` to be usable and the log to say
   `worker took control`. If registration just happened, reload once.
2. **Control run.** Leave the mode on **Direct**. Press Play, confirm audio.
3. Lock the phone. Wait about two minutes with audio playing. Do not open other apps.
4. Unlock and read the verdict. Expect `KEPT PLAYING`. If it does not, something unrelated to
   the worker is interfering — fix that before continuing.
5. **Playability runs.** Press **Worker pass-through**, then Play. Note whether audio starts.
   Repeat with **Worker teed**. If either fails, note the `Worker saw request` row.
6. **Lock run.** Only if teed mode plays: lock the phone for about two minutes and read the
   verdict. This is the question the probe exists to answer.

Do not attach Safari Web Inspector during the lock. A connected debugger keeps the page alive
and will mask exactly the suspension being measured. Everything needed is rendered on the page.

## Reading the result

The verdict compares wall-clock time against `audio.currentTime` across the freeze. If the
page was frozen for 120s and playback advanced 118s, audio ran the whole time. If it advanced
0s, playback stopped when the screen locked.

The log adds the reason:

| Observation | Meaning |
| --- | --- |
| `KEPT PLAYING` on the teed run | The worker survives backgrounding. Worth building on. |
| `STOPPED` on the teed run, `KEPT PLAYING` on the control | iOS suspends the worker and starves the element. Table the oscilloscope. |
| `worker byte gap of Ns` | The worker itself stalled for N seconds — it was suspended, not the element. |
| `worker was restarted` | iOS killed the worker outright. |
| `upstream fetch failed (likely CORS)` | The station does not send CORS headers, so the worker cannot read the body. Not a lock-screen result. |
| `worker saw a Range request` | WebKit range-probed the stream. If playback never started, that is the cause, not backgrounding. |

If playback never starts, `error code=4` (`MEDIA_ERR_SRC_NOT_SUPPORTED`) means WebKit rejected
the response rather than the network failing. Read it together with `Worker saw request`:

| Pass-through | Teed | `Worker saw request` | Conclusion |
| --- | --- | --- | --- |
| plays | plays | yes | Service worker media works. Continue to the lock run. |
| plays | fails | yes | WebKit refuses JS-constructed bodies. Teeing is impossible, so the oscilloscope cannot be fed this way. |
| fails | fails | yes | WebKit refuses service worker media outright. |
| fails | fails | no | The media load never reached the worker. WebKit loads media outside the service worker entirely. |
