# dev-radio-station

Local fake Shoutcast/ICY radio for Listening Room testing ([ADR 0207](../../docs/adrs/0207-local-dev-radio-station.md)).

See [docs/RADIO_LOCAL_TESTING.md](../../docs/RADIO_LOCAL_TESTING.md) for Compose setup, URL split, and Media Bridge wiring.

```bash
# Host
REDIS_URL=redis://127.0.0.1:6379 npm run start -w dev-radio-station

# Tests
npm test -w dev-radio-station
```
